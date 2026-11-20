import { Dimensions } from "react-native";
import { targetHandle, type TargetRect } from "../stores/useTourTargets";

// Room kept clear for the top bar and the floating tab bar.
const TOP_CLEARANCE = 96;
const BOTTOM_CLEARANCE = 150;

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// Scrolls the target's page so it sits in the upper third of the screen, then reports where it ended up.
export async function scrollTargetIntoView(id: string): Promise<TargetRect | null> {
  const handle = targetHandle(id);
  if (!handle) return null;
  const rect = await handle.measure();
  if (!rect || !handle.page) return rect;
  const height = Dimensions.get("window").height;
  if (rect.y >= TOP_CLEARANCE && rect.y + rect.height <= height - BOTTOM_CLEARANCE) return rect;
  handle.page.scrollTo(Math.max(0, handle.page.getScrollY() + rect.y - height * 0.3));
  await nextFrame();
  await nextFrame();
  return handle.measure();
}
