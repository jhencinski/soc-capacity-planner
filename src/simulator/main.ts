import "../style.css";
import {
  computeCapacity,
  type TeamInputs,
  type WorkloadItem,
} from "../simple/model";
import { runSimulation, type SpikeConfig } from "./simulation";
import { renderBacklogChart } from "./chart";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function readNumber(input: HTMLInputElement, min = 0): number {
  const value = parseFloat(input.value);
  return Number.isFinite(value) && value >= min ? value : min;
}

const analystsInput = byId<HTMLInputElement>("analysts");
const hoursPerDayInput = byId<HTMLInputElement>("hoursPerDay");
const daysPerMonthInput = byId<HTMLInputElement>("daysPerMonth");
const productivityInput = byId<HTMLInputElement>("productivity");
const productivityValue = byId<HTMLSpanElement>("productivityValue");

const triageVolumeInput = byId<HTMLInputElement>("triage-volume");
const triageMinutesInput = byId<HTMLInputElement>("triage-minutes");
const investigationVolumeInput = byId<HTMLInputElement>("investigation-volume");
const investigationMinutesInput = byId<HTMLInputElement>("investigation-minutes");
const incidentVolumeInput = byId<HTMLInputElement>("incident-volume");
const incidentMinutesInput = byId<HTMLInputElement>("incident-minutes");

const spikeEnabledInput = byId<HTMLInputElement>("spikeEnabled");
const spikePercentInput = byId<HTMLInputElement>("spikePercent");
const spikeStartDayInput = byId<HTMLInputElement>("spikeStartDay");
const spikeEndDayInput = byId<HTMLInputElement>("spikeEndDay");

const rerunBtn = byId<HTMLButtonElement>("rerunBtn");
const chartContainer = byId<HTMLDivElement>("chartContainer");
const avgWaitValueEl = byId<HTMLSpanElement>("avgWaitValue");
const p95WaitValueEl = byId<HTMLSpanElement>("p95WaitValue");
const peakBacklogValueEl = byId<HTMLSpanElement>("peakBacklogValue");
const calloutTextEl = byId<HTMLParagraphElement>("calloutText");
const truncatedNoteEl = byId<HTMLParagraphElement>("truncatedNote");

function readTeam(): TeamInputs {
  return {
    analysts: readNumber(analystsInput, 1),
    hoursPerDay: readNumber(hoursPerDayInput),
    daysPerMonth: readNumber(daysPerMonthInput),
    productivityPct: readNumber(productivityInput),
  };
}

function readWorkload(): WorkloadItem[] {
  return [
    {
      key: "triage",
      label: "Alerts triaged",
      volumePerMonth: readNumber(triageVolumeInput),
      minutesEach: readNumber(triageMinutesInput),
    },
    {
      key: "investigation",
      label: "Investigations",
      volumePerMonth: readNumber(investigationVolumeInput),
      minutesEach: readNumber(investigationMinutesInput),
    },
    {
      key: "incident",
      label: "Confirmed incidents",
      volumePerMonth: readNumber(incidentVolumeInput),
      minutesEach: readNumber(incidentMinutesInput),
    },
  ];
}

function readSpike(): SpikeConfig | null {
  if (!spikeEnabledInput.checked) return null;
  return {
    enabled: true,
    percentIncrease: readNumber(spikePercentInput),
    startDay: readNumber(spikeStartDayInput, 1),
    endDay: readNumber(spikeEndDayInput, 1),
  };
}

function run(): void {
  productivityValue.textContent = `${productivityInput.value}%`;

  const team = readTeam();
  const items = readWorkload();
  const spike = readSpike();

  const staticResult = computeCapacity(team, items);
  const sim = runSimulation(team, items, spike);

  renderBacklogChart(chartContainer, {
    series: sim.backlogSeries,
    horizonMinutes: 30 * 24 * 60,
    spike: spike ? { startDay: spike.startDay, endDay: spike.endDay } : null,
  });

  avgWaitValueEl.textContent = numberFormatter.format(sim.stats.avgWaitMinutes);
  p95WaitValueEl.textContent = numberFormatter.format(sim.stats.p95WaitMinutes);
  peakBacklogValueEl.textContent = numberFormatter.format(sim.stats.peakBacklog);

  const staticUtilPct = numberFormatter.format(staticResult.utilizationPct);
  if (sim.stats.peakBacklog === 0) {
    calloutTextEl.textContent = `Your average utilization is ${staticUtilPct}%. No meaningful backlog formed in this simulated month — the team kept up throughout, even with random variation${spike ? " and the spike" : ""}.`;
  } else {
    calloutTextEl.textContent = `Your average utilization is ${staticUtilPct}% — but in this simulated month, backlog peaked at ${numberFormatter.format(sim.stats.peakBacklog)} item(s) waiting at once, with an average wait of ${numberFormatter.format(sim.stats.avgWaitMinutes)} minutes (${numberFormatter.format(sim.stats.pctTimeWithBacklog)}% of the month had some backlog).`;
  }

  truncatedNoteEl.style.display = sim.truncated ? "block" : "none";
}

[
  analystsInput,
  hoursPerDayInput,
  daysPerMonthInput,
  productivityInput,
  triageVolumeInput,
  triageMinutesInput,
  investigationVolumeInput,
  investigationMinutesInput,
  incidentVolumeInput,
  incidentMinutesInput,
  spikeEnabledInput,
  spikePercentInput,
  spikeStartDayInput,
  spikeEndDayInput,
].forEach((input) => input.addEventListener("input", run));

rerunBtn.addEventListener("click", run);

run();
