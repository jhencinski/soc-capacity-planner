import type { ShiftInput, WorkloadItem } from "./model";

export interface Scenario {
  id: string;
  name: string;
  savedAt: number;
  shifts: ShiftInput[];
  workloadItems: WorkloadItem[];
}

const STORAGE_KEY = "soc-capacity-planner:scenarios";

function isShiftInput(value: unknown): value is ShiftInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.analysts === "number" &&
    typeof v.hoursPerDay === "number" &&
    typeof v.daysPerMonth === "number" &&
    typeof v.productivityPct === "number" &&
    typeof v.workloadSharePct === "number"
  );
}

function isWorkloadItem(value: unknown): value is WorkloadItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === "string" &&
    typeof v.label === "string" &&
    typeof v.volumePerMonth === "number" &&
    typeof v.minutesEach === "number"
  );
}

function isScenario(value: unknown): value is Scenario {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.savedAt === "number" &&
    Array.isArray(v.shifts) &&
    v.shifts.every(isShiftInput) &&
    Array.isArray(v.workloadItems) &&
    v.workloadItems.every(isWorkloadItem)
  );
}

export function loadScenarios(): Scenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isScenario);
  } catch {
    return [];
  }
}

function persist(scenarios: Scenario[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
}

export function saveScenario(
  name: string,
  shifts: ShiftInput[],
  workloadItems: WorkloadItem[],
): Scenario {
  const scenarios = loadScenarios();
  const scenario: Scenario = {
    id: crypto.randomUUID(),
    name,
    savedAt: Date.now(),
    shifts: structuredClone(shifts),
    workloadItems: structuredClone(workloadItems),
  };
  scenarios.push(scenario);
  persist(scenarios);
  return scenario;
}

export function deleteScenario(id: string): void {
  const scenarios = loadScenarios().filter((s) => s.id !== id);
  persist(scenarios);
}
