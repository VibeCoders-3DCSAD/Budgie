import { onTourLayout, sameRect, targetHandle, type TargetRect } from "../stores/useTourTargets";

// Frames in a row a target must hold still before measuring stops, and how often a still target is
// checked afterwards in case something moved it without a scroll or layout event (content loading above it).
export const SETTLE_FRAMES = 6;
export const IDLE_CHECK_MS = 750;

// Reports where a tour target is on screen (null when it is not mounted or not laid out), each time that
// changes. It measures every frame while the target is moving (a screen sliding in, a scroll settling) and
// then stops until a scroll or layout event, so the highlight follows within a frame rather than a timer
// tick, and costs nothing while the step simply sits on screen.
export function followTarget(id: string, onChange: (rect: TargetRect | null) => void): () => void {
  let active = true;
  let shown: TargetRect | null | undefined;
  let running = false;
  let still = 0;
  let frame: number | null = null;

  const measure = async (): Promise<boolean> => {
    const handle = targetHandle(id);
    const rect = handle ? await handle.measure() : null;
    if (!active) return false;
    if (shown !== undefined && sameRect(shown, rect)) return false;
    shown = rect;
    onChange(rect);
    return true;
  };

  const tick = async () => {
    frame = null;
    const moved = await measure();
    if (!active) return;
    still = moved ? 0 : still + 1;
    if (still >= SETTLE_FRAMES) running = false;
    else frame = requestAnimationFrame(() => { void tick(); });
  };

  const wake = () => {
    if (!active) return;
    still = 0;
    if (running) return;
    running = true;
    void tick();
  };

  wake();
  const unsubscribe = onTourLayout(wake);
  const idle = setInterval(() => { if (!running) void measure().then((moved) => { if (moved) wake(); }); }, IDLE_CHECK_MS);
  return () => {
    active = false;
    if (frame !== null) cancelAnimationFrame(frame);
    clearInterval(idle);
    unsubscribe();
  };
}
