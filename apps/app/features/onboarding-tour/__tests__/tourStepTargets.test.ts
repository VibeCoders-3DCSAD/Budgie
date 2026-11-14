import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { TOUR_STEPS } from "../steps";
import { TOUR_STAGES } from "../types";

// TourTarget ids written into screens: literal ids, plus the prefixes of ids built from data.
function sourceTargets(root: string) {
  const literal = new Set<string>();
  const prefixes = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "__tests__") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".tsx")) {
        const text = readFileSync(full, "utf8");
        for (const match of text.matchAll(/<TourTarget[^>]*?\bid="([^"]+)"/g)) literal.add(match[1]!);
        for (const match of text.matchAll(/<TourTarget[^>]*?\bid=\{`([^`$]*)\$\{/g)) prefixes.add(match[1]!);
        for (const match of text.matchAll(/<TourTarget[^>]*?\bid=\{groupIndex === 0 \? "([^"]+)"/g)) literal.add(match[1]!);
        // A kebab menu marked for the tour: its button, and its open menu.
        for (const match of text.matchAll(/\bkebabTourId=\{[^}]*?"([^"]+)"/g)) { literal.add(match[1]!); literal.add(`${match[1]!}-menu`); }
      }
    }
  };
  for (const dir of ["features", "app"]) walk(join(root, dir));
  return { literal, prefixes };
}

const { literal, prefixes } = sourceTargets(join(__dirname, "../../.."));

it("points every step at a control some screen marks with TourTarget", () => {
  const missing = TOUR_STEPS.flatMap((step) => {
    if (!step.target) return [];
    const found = literal.has(step.target) || [...prefixes].some((prefix) => prefix && step.target!.startsWith(prefix));
    return found ? [] : [`${step.id} → ${step.target}`];
  });
  expect(missing).toEqual([]);
});

it("has unique step ids, a route or target for every step, and every stage in order", () => {
  const ids = TOUR_STEPS.map((step) => step.id);
  expect(new Set(ids).size).toBe(ids.length);
  const stages = [...new Set(TOUR_STEPS.map((step) => step.stage))];
  expect(stages).toEqual([...TOUR_STAGES]);
  expect(TOUR_STEPS.filter((step) => step.action && !step.target)).toEqual([]);
  expect(TOUR_STEPS.filter((step) => step.until && step.action !== "fill")).toEqual([]);
});
