import {
  monthlyCapacityHours,
  type TeamInputs,
  type WorkloadItem,
} from "../simple/model";

export const HORIZON_DAYS = 30;
export const HORIZON_MINUTES = HORIZON_DAYS * 24 * 60;

const MAX_SIMULATED_MINUTES = HORIZON_MINUTES * 3;
const MAX_EVENTS = 200_000;

export interface SpikeConfig {
  enabled: boolean;
  startDay: number;
  endDay: number;
  percentIncrease: number;
}

export interface BacklogPoint {
  timeMinutes: number;
  queueLength: number;
}

export interface CompletedTask {
  arrivalMinute: number;
  waitMinutes: number;
  category: string;
}

export interface SimulationStats {
  avgWaitMinutes: number;
  p95WaitMinutes: number;
  peakBacklog: number;
  pctTimeWithBacklog: number;
  completedCount: number;
}

export interface SimulationResult {
  backlogSeries: BacklogPoint[];
  completed: CompletedTask[];
  serverCount: number;
  dutyCycleFraction: number;
  truncated: boolean;
  finalTimeMinutes: number;
  stats: SimulationStats;
}

function sampleExponential(mean: number): number {
  const u = Math.random();
  return -mean * Math.log(1 - u);
}

function pickWeightedItem(items: WorkloadItem[]): WorkloadItem {
  const total = items.reduce((sum, item) => sum + item.volumePerMonth, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.volumePerMonth;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

interface Arrival {
  time: number;
  item: WorkloadItem;
}

function generateArrivals(
  items: WorkloadItem[],
  horizonMinutes: number,
  spike: SpikeConfig | null,
): Arrival[] {
  const baseRatePerMinute =
    items.reduce((sum, item) => sum + item.volumePerMonth, 0) /
    horizonMinutes;
  if (baseRatePerMinute <= 0) return [];

  const spikeStart = spike ? spike.startDay * 1440 : 0;
  const spikeEnd = spike ? spike.endDay * 1440 : 0;

  const segments: { start: number; end: number; multiplier: number }[] =
    spike && spike.enabled && spikeEnd > spikeStart
      ? [
          { start: 0, end: spikeStart, multiplier: 1 },
          {
            start: spikeStart,
            end: spikeEnd,
            multiplier: 1 + spike.percentIncrease / 100,
          },
          { start: spikeEnd, end: horizonMinutes, multiplier: 1 },
        ].filter((s) => s.end > s.start)
      : [{ start: 0, end: horizonMinutes, multiplier: 1 }];

  const arrivals: Arrival[] = [];
  for (const seg of segments) {
    const rate = baseRatePerMinute * seg.multiplier;
    if (rate <= 0) continue;
    let t = seg.start;
    while (true) {
      t += sampleExponential(1 / rate);
      if (t >= seg.end) break;
      arrivals.push({ time: t, item: pickWeightedItem(items) });
    }
  }
  return arrivals;
}

export function runSimulation(
  team: TeamInputs,
  items: WorkloadItem[],
  spike: SpikeConfig | null,
): SimulationResult {
  const serverCount = Math.max(1, Math.round(team.analysts));
  const capacityMinutes = monthlyCapacityHours(team) * 60;
  const dutyCycleFraction = Math.max(
    capacityMinutes / (serverCount * HORIZON_MINUTES),
    0.0001,
  );

  const arrivals = generateArrivals(items, HORIZON_MINUTES, spike).sort(
    (a, b) => a.time - b.time,
  );

  const serverBusyUntil: (number | null)[] = new Array(serverCount).fill(
    null,
  );
  const queue: Arrival[] = [];
  const completed: CompletedTask[] = [];
  const backlogSeries: BacklogPoint[] = [{ timeMinutes: 0, queueLength: 0 }];

  let arrivalIdx = 0;
  let time = 0;
  let eventCount = 0;
  let truncated = false;

  const serviceMinutesFor = (item: WorkloadItem) =>
    sampleExponential(item.minutesEach / dutyCycleFraction);

  const nextDeparture = (): { time: number; serverIdx: number } | null => {
    let best: { time: number; serverIdx: number } | null = null;
    for (let i = 0; i < serverBusyUntil.length; i++) {
      const busyUntil = serverBusyUntil[i];
      if (busyUntil !== null && (best === null || busyUntil < best.time)) {
        best = { time: busyUntil, serverIdx: i };
      }
    }
    return best;
  };

  while (true) {
    const nextArrival = arrivalIdx < arrivals.length ? arrivals[arrivalIdx] : null;
    const dep = nextDeparture();

    if (!nextArrival && !dep && queue.length === 0) break;
    if (eventCount++ > MAX_EVENTS || time > MAX_SIMULATED_MINUTES) {
      truncated = true;
      break;
    }

    if (nextArrival && (!dep || nextArrival.time <= dep.time)) {
      time = nextArrival.time;
      arrivalIdx++;
      const idleIdx = serverBusyUntil.findIndex((b) => b === null);
      if (idleIdx !== -1) {
        serverBusyUntil[idleIdx] = time + serviceMinutesFor(nextArrival.item);
        completed.push({
          arrivalMinute: nextArrival.time,
          waitMinutes: 0,
          category: nextArrival.item.key,
        });
      } else {
        queue.push(nextArrival);
      }
      backlogSeries.push({ timeMinutes: time, queueLength: queue.length });
    } else if (dep) {
      time = dep.time;
      serverBusyUntil[dep.serverIdx] = null;
      const task = queue.shift();
      if (task) {
        serverBusyUntil[dep.serverIdx] = time + serviceMinutesFor(task.item);
        completed.push({
          arrivalMinute: task.time,
          waitMinutes: time - task.time,
          category: task.item.key,
        });
      }
      backlogSeries.push({ timeMinutes: time, queueLength: queue.length });
    } else {
      break;
    }
  }

  const waits = completed.map((c) => c.waitMinutes).sort((a, b) => a - b);
  const avgWaitMinutes = waits.length
    ? waits.reduce((s, w) => s + w, 0) / waits.length
    : 0;
  const p95WaitMinutes = waits.length
    ? waits[Math.min(waits.length - 1, Math.floor(waits.length * 0.95))]
    : 0;
  const peakBacklog = backlogSeries.reduce(
    (max, p) => Math.max(max, p.queueLength),
    0,
  );

  let backlogMinutesWithQueue = 0;
  for (let i = 0; i < backlogSeries.length; i++) {
    const cur = backlogSeries[i];
    const nextTime =
      i + 1 < backlogSeries.length
        ? backlogSeries[i + 1].timeMinutes
        : HORIZON_MINUTES;
    const segStart = Math.min(cur.timeMinutes, HORIZON_MINUTES);
    const segEnd = Math.min(nextTime, HORIZON_MINUTES);
    if (segEnd > segStart && cur.queueLength > 0) {
      backlogMinutesWithQueue += segEnd - segStart;
    }
  }
  const pctTimeWithBacklog = (backlogMinutesWithQueue / HORIZON_MINUTES) * 100;

  return {
    backlogSeries,
    completed,
    serverCount,
    dutyCycleFraction,
    truncated,
    finalTimeMinutes: time,
    stats: {
      avgWaitMinutes,
      p95WaitMinutes,
      peakBacklog,
      pctTimeWithBacklog,
      completedCount: completed.length,
    },
  };
}
