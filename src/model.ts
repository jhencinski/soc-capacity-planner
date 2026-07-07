export interface ShiftInput {
  id: string;
  label: string;
  analysts: number;
  hoursPerDay: number;
  daysPerMonth: number;
  productivityPct: number;
  workloadSharePct: number;
}

export interface WorkloadItem {
  key: string;
  label: string;
  volumePerMonth: number;
  minutesEach: number;
}

export type StatusKey = "under" | "good" | "warning" | "serious" | "critical";

export interface StatusInfo {
  key: StatusKey;
  label: string;
  description: string;
}

export interface ShiftResult {
  shift: ShiftInput;
  capacityHours: number;
  workloadHours: number;
  utilizationPct: number;
  status: StatusInfo;
}

export interface CapacityResult {
  capacityHours: number;
  loadingHours: number;
  utilizationPct: number;
  status: StatusInfo;
  shiftResults: ShiftResult[];
  workloadShareTotalPct: number;
}

export function shiftCapacityHours(shift: ShiftInput): number {
  return (
    shift.analysts *
    shift.hoursPerDay *
    shift.daysPerMonth *
    (shift.productivityPct / 100)
  );
}

export function totalCapacityHours(shifts: ShiftInput[]): number {
  return shifts.reduce((sum, shift) => sum + shiftCapacityHours(shift), 0);
}

export function monthlyLoadingHours(items: WorkloadItem[]): number {
  const totalMinutes = items.reduce(
    (sum, item) => sum + item.volumePerMonth * item.minutesEach,
    0,
  );
  return totalMinutes / 60;
}

export function classifyUtilization(utilizationPct: number): StatusInfo {
  if (utilizationPct < 60) {
    return {
      key: "under",
      label: "Under capacity",
      description:
        "The team has slack. Room to absorb more volume, cross-train, or take on project work — or a signal that staffing could be leaner.",
    };
  }
  if (utilizationPct < 85) {
    return {
      key: "good",
      label: "Healthy utilization",
      description:
        "A sustainable buffer exists to absorb spikes in volume without a backlog forming.",
    };
  }
  if (utilizationPct < 100) {
    return {
      key: "warning",
      label: "Near capacity",
      description:
        "Little slack left. A small increase in volume will start a queue, and coverage gaps (PTO, attrition) will hurt.",
    };
  }
  if (utilizationPct < 115) {
    return {
      key: "serious",
      label: "Over capacity",
      description:
        "Demand exceeds available working hours. Expect a growing backlog, slower triage, and rising MTTR.",
    };
  }
  return {
    key: "critical",
    label: "Significantly over capacity",
    description:
      "Sustained overload. High risk of missed SLAs, analyst burnout, and attrition — the backlog will keep compounding.",
  };
}

export function computeCapacity(
  shifts: ShiftInput[],
  items: WorkloadItem[],
): CapacityResult {
  const capacityHours = totalCapacityHours(shifts);
  const loadingHours = monthlyLoadingHours(items);
  const utilizationPct =
    capacityHours > 0 ? (loadingHours / capacityHours) * 100 : 0;

  const shiftResults: ShiftResult[] = shifts.map((shift) => {
    const shiftCapacity = shiftCapacityHours(shift);
    const shiftWorkload = loadingHours * (shift.workloadSharePct / 100);
    const shiftUtilizationPct =
      shiftCapacity > 0 ? (shiftWorkload / shiftCapacity) * 100 : 0;
    return {
      shift,
      capacityHours: shiftCapacity,
      workloadHours: shiftWorkload,
      utilizationPct: shiftUtilizationPct,
      status: classifyUtilization(shiftUtilizationPct),
    };
  });

  const workloadShareTotalPct = shifts.reduce(
    (sum, shift) => sum + shift.workloadSharePct,
    0,
  );

  return {
    capacityHours,
    loadingHours,
    utilizationPct,
    status: classifyUtilization(utilizationPct),
    shiftResults,
    workloadShareTotalPct,
  };
}

export function createShift(overrides: Partial<ShiftInput> = {}): ShiftInput {
  return {
    id: crypto.randomUUID(),
    label: "New shift",
    analysts: 1,
    hoursPerDay: 8,
    daysPerMonth: 22,
    productivityPct: 70,
    workloadSharePct: 0,
    ...overrides,
  };
}

export function defaultShifts(): ShiftInput[] {
  return [
    createShift({
      label: "All hours",
      analysts: 4,
      hoursPerDay: 8,
      daysPerMonth: 22,
      productivityPct: 70,
      workloadSharePct: 100,
    }),
  ];
}

export function defaultWorkloadItems(): WorkloadItem[] {
  return [
    { key: "triage", label: "Alerts triaged", volumePerMonth: 400, minutesEach: 15 },
    {
      key: "investigation",
      label: "Investigations",
      volumePerMonth: 80,
      minutesEach: 60,
    },
    {
      key: "incident",
      label: "Confirmed incidents",
      volumePerMonth: 12,
      minutesEach: 180,
    },
  ];
}
