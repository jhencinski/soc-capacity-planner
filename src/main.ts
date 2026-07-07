import "./style.css";
import {
  computeCapacity,
  createShift,
  defaultShifts,
  defaultWorkloadItems,
  type ShiftInput,
  type StatusKey,
  type WorkloadItem,
} from "./model";
import {
  deleteScenario,
  loadScenarios,
  saveScenario,
  type Scenario,
} from "./scenarios";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

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

// ---- Workload (fixed 3 categories) ----

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

function readNumber(input: HTMLInputElement): number {
  const value = parseFloat(input.value);
  return Number.isFinite(value) && value >= 0 ? value : 0;
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

function writeWorkload(items: WorkloadItem[]): void {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const triage = byKey.get("triage");
  const investigation = byKey.get("investigation");
  const incident = byKey.get("incident");
  if (triage) {
    triageVolumeInput.value = String(triage.volumePerMonth);
    triageMinutesInput.value = String(triage.minutesEach);
  }
  if (investigation) {
    investigationVolumeInput.value = String(investigation.volumePerMonth);
    investigationMinutesInput.value = String(investigation.minutesEach);
  }
  if (incident) {
    incidentVolumeInput.value = String(incident.volumePerMonth);
    incidentMinutesInput.value = String(incident.minutesEach);
  }
}

[
  triageVolumeInput,
  triageMinutesInput,
  investigationVolumeInput,
  investigationMinutesInput,
  incidentVolumeInput,
  incidentMinutesInput,
].forEach((input) => input.addEventListener("input", () => renderResults()));

// ---- Shifts (dynamic list) ----

let shifts: ShiftInput[] = defaultShifts();

const shiftsContainer = byId<HTMLDivElement>("shiftsContainer");
const addShiftBtn = byId<HTMLButtonElement>("addShiftBtn");
const shareTotalHint = byId<HTMLParagraphElement>("shareTotalHint");

function shiftCardHTML(shift: ShiftInput): string {
  return `
    <div class="shift-card" data-shift-id="${shift.id}">
      <div class="shift-card-header">
        <input
          type="text"
          class="shift-label-input"
          data-field="label"
          value="${escapeHtml(shift.label)}"
          aria-label="Shift name"
        />
        ${
          shifts.length > 1
            ? `<button type="button" class="remove-shift-btn" aria-label="Remove shift">&times;</button>`
            : ""
        }
      </div>
      <div class="shift-fields">
        <div class="field-compact">
          <label>Analysts</label>
          <input type="number" data-field="analysts" min="0" step="1" value="${shift.analysts}" />
        </div>
        <div class="field-compact">
          <label>Hours/day</label>
          <input type="number" data-field="hoursPerDay" min="0" step="0.5" value="${shift.hoursPerDay}" />
        </div>
        <div class="field-compact">
          <label>Days/month</label>
          <input type="number" data-field="daysPerMonth" min="0" step="1" value="${shift.daysPerMonth}" />
        </div>
        <div class="field-compact">
          <label>Productivity %</label>
          <input type="number" data-field="productivityPct" min="0" max="100" step="5" value="${shift.productivityPct}" />
        </div>
        <div class="field-compact">
          <label>Workload share %</label>
          <input type="number" data-field="workloadSharePct" min="0" max="100" step="5" value="${shift.workloadSharePct}" />
        </div>
      </div>
    </div>
  `;
}

function renderShiftCards(): void {
  shiftsContainer.innerHTML = shifts.map(shiftCardHTML).join("");
}

function updateShareHint(): void {
  const total = shifts.reduce((sum, s) => sum + s.workloadSharePct, 0);
  if (Math.round(total) === 100) {
    shareTotalHint.textContent = `Workload shares total ${numberFormatter.format(total)}%.`;
    shareTotalHint.classList.remove("hint-warning");
  } else {
    shareTotalHint.textContent = `Workload shares total ${numberFormatter.format(total)}% — they should add up to 100% across shifts.`;
    shareTotalHint.classList.add("hint-warning");
  }
}

shiftsContainer.addEventListener("input", (e) => {
  const target = e.target as HTMLElement;
  const field = target.dataset.field;
  if (!field) return;
  const card = target.closest<HTMLElement>(".shift-card");
  const shiftId = card?.dataset.shiftId;
  const shift = shifts.find((s) => s.id === shiftId);
  if (!shift) return;

  if (field === "label") {
    shift.label = (target as HTMLInputElement).value;
  } else {
    const value = parseFloat((target as HTMLInputElement).value);
    (shift as unknown as Record<string, number>)[field] = Number.isFinite(
      value,
    )
      ? value
      : 0;
  }

  if (field === "workloadSharePct") updateShareHint();
  renderResults();
});

shiftsContainer.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains("remove-shift-btn")) return;
  const card = target.closest<HTMLElement>(".shift-card");
  const shiftId = card?.dataset.shiftId;
  if (!shiftId || shifts.length <= 1) return;
  shifts = shifts.filter((s) => s.id !== shiftId);
  renderShiftCards();
  updateShareHint();
  renderResults();
});

addShiftBtn.addEventListener("click", () => {
  shifts.push(
    createShift({ label: `Shift ${shifts.length + 1}`, workloadSharePct: 0 }),
  );
  renderShiftCards();
  updateShareHint();
  renderResults();
});

// ---- Results ----

const capacityValueEl = byId<HTMLSpanElement>("capacityValue");
const loadingValueEl = byId<HTMLSpanElement>("loadingValue");
const utilizationValueEl = byId<HTMLSpanElement>("utilizationValue");

const meterFillEl = byId<HTMLDivElement>("meterFill");
const statusDotEl = byId<HTMLSpanElement>("statusDot");
const statusLabelEl = byId<HTMLParagraphElement>("statusLabel");
const statusDescriptionEl = byId<HTMLParagraphElement>("statusDescription");

const shiftTableBody = byId<HTMLTableSectionElement>("shiftTableBody");

function statusChipHTML(color: string, label: string): string {
  return `<span class="status-chip"><span class="status-chip-dot" style="background:${color}"></span>${escapeHtml(label)}</span>`;
}

function renderResults(): void {
  const workload = readWorkload();
  const result = computeCapacity(shifts, workload);

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

  shiftTableBody.innerHTML = result.shiftResults
    .map((sr) => {
      const chipColor = STATUS_COLOR_VAR[sr.status.key];
      return `
        <tr>
          <td>${escapeHtml(sr.shift.label)}</td>
          <td>${numberFormatter.format(sr.capacityHours)} hrs</td>
          <td>${numberFormatter.format(sr.workloadHours)} hrs</td>
          <td>${numberFormatter.format(sr.utilizationPct)}%</td>
          <td>${statusChipHTML(chipColor, sr.status.label)}</td>
        </tr>
      `;
    })
    .join("");
}

// ---- Scenarios ----

const scenarioNameInput = byId<HTMLInputElement>("scenarioName");
const saveScenarioBtn = byId<HTMLButtonElement>("saveScenarioBtn");
const scenarioList = byId<HTMLDivElement>("scenarioList");
const scenarioEmptyHint = byId<HTMLParagraphElement>("scenarioEmptyHint");

function scenarioRowHTML(scenario: Scenario): string {
  const result = computeCapacity(scenario.shifts, scenario.workloadItems);
  const chipColor = STATUS_COLOR_VAR[result.status.key];
  return `
    <div class="scenario-row" data-scenario-id="${scenario.id}">
      <div class="scenario-row-info">
        <p class="scenario-row-name">${escapeHtml(scenario.name)}</p>
        <p class="scenario-row-meta">
          ${numberFormatter.format(result.capacityHours)} hrs capacity &middot;
          ${numberFormatter.format(result.loadingHours)} hrs workload &middot;
          ${numberFormatter.format(result.utilizationPct)}% &middot;
          ${statusChipHTML(chipColor, result.status.label)}
        </p>
      </div>
      <div class="scenario-actions">
        <button type="button" class="load-scenario-btn" data-scenario-id="${scenario.id}">Load</button>
        <button type="button" class="delete-scenario-btn" data-scenario-id="${scenario.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderScenarioTable(): void {
  const scenarios = loadScenarios();
  scenarioList.innerHTML = scenarios.map(scenarioRowHTML).join("");
  scenarioEmptyHint.style.display = scenarios.length === 0 ? "block" : "none";
}

saveScenarioBtn.addEventListener("click", () => {
  const name = scenarioNameInput.value.trim() || `Scenario (${new Date().toLocaleString()})`;
  saveScenario(name, shifts, readWorkload());
  scenarioNameInput.value = "";
  renderScenarioTable();
});

scenarioList.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const scenarioId = target.dataset.scenarioId;
  if (!scenarioId) return;

  if (target.classList.contains("delete-scenario-btn")) {
    deleteScenario(scenarioId);
    renderScenarioTable();
    return;
  }

  if (target.classList.contains("load-scenario-btn")) {
    const scenario = loadScenarios().find((s) => s.id === scenarioId);
    if (!scenario) return;
    shifts = structuredClone(scenario.shifts);
    writeWorkload(scenario.workloadItems);
    renderShiftCards();
    updateShareHint();
    renderResults();
  }
});

// ---- Init ----

if (shifts.length === 0) shifts = defaultShifts();
writeWorkload(defaultWorkloadItems());
renderShiftCards();
updateShareHint();
renderResults();
renderScenarioTable();
