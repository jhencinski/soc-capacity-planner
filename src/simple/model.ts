export interface TeamInputs {
  analysts: number;
  hoursPerDay: number;
  daysPerMonth: number;
  productivityPct: number;
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

export interface CapacityResult {
  capacityHours: number;
  loadingHours: number;
  utilizationPct: number;
  status: StatusInfo;
}

export function monthlyCapacityHours(team: TeamInputs): number {
  return (
    team.analysts *
    team.hoursPerDay *
    team.daysPerMonth *
    (team.productivityPct / 100)
  );
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
  team: TeamInputs,
  items: WorkloadItem[],
): CapacityResult {
  const capacityHours = monthlyCapacityHours(team);
  const loadingHours = monthlyLoadingHours(items);
  const utilizationPct =
    capacityHours > 0 ? (loadingHours / capacityHours) * 100 : 0;
  return {
    capacityHours,
    loadingHours,
    utilizationPct,
    status: classifyUtilization(utilizationPct),
  };
}
