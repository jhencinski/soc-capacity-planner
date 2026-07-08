import type { ShiftBlock } from "./model";

export interface CoveragePlan {
  id: string;
  name: string;
  savedAt: number;
  blocks: ShiftBlock[];
}

const STORAGE_KEY = "soc-capacity-planner:coverage-plans";

function isShiftBlock(value: unknown): value is ShiftBlock {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.analysts === "number" &&
    typeof v.utcOffsetHours === "number" &&
    typeof v.preset === "string" &&
    Array.isArray(v.daysOfWeek) &&
    typeof v.startHour === "number" &&
    typeof v.endHour === "number"
  );
}

function isCoveragePlan(value: unknown): value is CoveragePlan {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.savedAt === "number" &&
    Array.isArray(v.blocks) &&
    v.blocks.every(isShiftBlock)
  );
}

export function loadPlans(): CoveragePlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCoveragePlan);
  } catch {
    return [];
  }
}

function persist(plans: CoveragePlan[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

export function savePlan(name: string, blocks: ShiftBlock[]): CoveragePlan {
  const plans = loadPlans();
  const plan: CoveragePlan = {
    id: crypto.randomUUID(),
    name,
    savedAt: Date.now(),
    blocks: structuredClone(blocks),
  };
  plans.push(plan);
  persist(plans);
  return plan;
}

export function deletePlan(id: string): void {
  const plans = loadPlans().filter((p) => p.id !== id);
  persist(plans);
}
