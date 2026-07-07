import "./style.css";
import {
  computeCapacity,
  type StatusKey,
  type TeamInputs,
  type WorkloadItem,
} from "./model";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const analystsInput = byId<HTMLInputElement>("analysts");
const hoursPerDayInput = byId<HTMLInputElement>("hoursPerDay");
const daysPerMonthInput = byId<HTMLInputElement>("daysPerMonth");
const productivityInput = byId<HTMLInputElement>("productivity");
const productivityValue = byId<HTMLSpanElement>("productivityValue");

const triageVolumeInput = byId<HTMLInputElement>("triage-volume");
const triageMinutesInput = byId<HTMLInputElement>("triage-minutes");
const investigationVolumeInput = byId<HTMLInputElement>(
  "investigation-volume",
);
const investigationMinutesInput = byId<HTMLInputElement>(
  "investigation-minutes",
);
const incidentVolumeInput = byId<HTMLInputElement>("incident-volume");
const incidentMinutesInput = byId<HTMLInputElement>("incident-minutes");

const capacityValueEl = byId<HTMLSpanElement>("capacityValue");
const loadingValueEl = byId<HTMLSpanElement>("loadingValue");
const utilizationValueEl = byId<HTMLSpanElement>("utilizationValue");

const meterFillEl = byId<HTMLDivElement>("meterFill");
const statusDotEl = byId<HTMLSpanElement>("statusDot");
const statusLabelEl = byId<HTMLParagraphElement>("statusLabel");
const statusDescriptionEl = byId<HTMLParagraphElement>("statusDescription");

const STATUS_COLOR_VAR: Record<StatusKey, string> = {
  under: "var(--blue)",
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function readNumber(input: HTMLInputElement): number {
  const value = parseFloat(input.value);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function readTeam(): TeamInputs {
  return {
    analysts: readNumber(analystsInput),
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

function render(): void {
  productivityValue.textContent = `${productivityInput.value}%`;

  const team = readTeam();
  const workload = readWorkload();
  const result = computeCapacity(team, workload);

  capacityValueEl.textContent = numberFormatter.format(result.capacityHours);
  loadingValueEl.textContent = numberFormatter.format(result.loadingHours);
  utilizationValueEl.textContent = `${numberFormatter.format(
    result.utilizationPct,
  )}%`;

  const fillWidth = Math.min(result.utilizationPct, 100);
  meterFillEl.style.width = `${fillWidth}%`;

  const color = STATUS_COLOR_VAR[result.status.key];
  meterFillEl.style.background = color;
  statusDotEl.style.background = color;
  statusLabelEl.textContent = `${result.status.label} — ${numberFormatter.format(result.utilizationPct)}% of capacity`;
  statusDescriptionEl.textContent = result.status.description;
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
].forEach((input) => input.addEventListener("input", render));

render();
