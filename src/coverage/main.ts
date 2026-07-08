import "../style.css";
import {
  createShiftBlock,
  defaultShiftBlocks,
  getPreset,
  PRESETS,
  UTC_OFFSETS,
  DAY_LABELS,
  type ShiftBlock,
  type SchedulePreset,
} from "./model";
import { computeCoverage, formatGapWindow } from "./coverage";
import { renderCoverageHeatmap } from "./heatmap";
import { deletePlan, loadPlans, savePlan, type CoveragePlan } from "./plans";

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

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatHour(h: number): string {
  const wrapped = ((h % 24) + 24) % 24;
  const hh = Math.floor(wrapped);
  const mm = Math.round((wrapped % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function summarizeDays(days: number[]): string {
  if (days.length === 7) return "Every day";
  if (days.length === 0) return "No days selected";
  const sorted = [...days].sort((a, b) => a - b);
  const isContiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (isContiguous) {
    return sorted.length === 1
      ? DAY_LABELS[sorted[0]]
      : `${DAY_LABELS[sorted[0]]}–${DAY_LABELS[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => DAY_LABELS[d]).join(", ");
}

let blocks: ShiftBlock[] = defaultShiftBlocks();

const blocksContainer = byId<HTMLDivElement>("blocksContainer");
const addBlockBtn = byId<HTMLButtonElement>("addBlockBtn");
const heatmapContainer = byId<HTMLDivElement>("heatmapContainer");
const coveragePctValueEl = byId<HTMLSpanElement>("coveragePctValue");
const gapHoursValueEl = byId<HTMLSpanElement>("gapHoursValue");
const minStaffedValueEl = byId<HTMLSpanElement>("minStaffedValue");
const gapSummaryEl = byId<HTMLDivElement>("gapSummary");

const planNameInput = byId<HTMLInputElement>("planName");
const savePlanBtn = byId<HTMLButtonElement>("savePlanBtn");
const planList = byId<HTMLDivElement>("planList");
const planEmptyHint = byId<HTMLParagraphElement>("planEmptyHint");

function customFieldsHTML(block: ShiftBlock): string {
  return `
    <div class="field-compact field-compact-wide">
      <label>Days worked</label>
      <div class="day-picker">
        ${DAY_LABELS.map(
          (lbl, idx) => `
          <label>
            <input type="checkbox" data-field="day-${idx}" ${block.daysOfWeek.includes(idx) ? "checked" : ""} />
            ${lbl}
          </label>`,
        ).join("")}
      </div>
    </div>
    <div class="field-compact">
      <label>Start (local)</label>
      <input type="number" data-field="startHour" min="0" max="24" step="0.5" value="${block.startHour}" />
    </div>
    <div class="field-compact">
      <label>End (local)</label>
      <input type="number" data-field="endHour" min="0" max="24" step="0.5" value="${block.endHour}" />
    </div>
  `;
}

function blockCardHTML(block: ShiftBlock): string {
  const preset = getPreset(block.preset);
  const summary = `${summarizeDays(block.daysOfWeek)}, ${formatHour(block.startHour)}–${formatHour(block.endHour)} local`;
  return `
    <div class="shift-block-card" data-block-id="${block.id}">
      <div class="shift-block-header">
        <input
          type="text"
          class="shift-label-input"
          data-field="label"
          value="${escapeHtml(block.label)}"
          aria-label="Crew name"
        />
        ${blocks.length > 1 ? `<button type="button" class="remove-block-btn" aria-label="Remove crew">&times;</button>` : ""}
      </div>
      <div class="shift-block-fields">
        <div class="field-compact">
          <label>Analysts on duty</label>
          <input type="number" data-field="analysts" min="0" step="1" value="${block.analysts}" />
        </div>
        <div class="field-compact">
          <label>Time zone</label>
          <select data-field="utcOffsetHours">
            ${UTC_OFFSETS.map(
              (o) =>
                `<option value="${o.value}" ${o.value === block.utcOffsetHours ? "selected" : ""}>${o.label}</option>`,
            ).join("")}
          </select>
        </div>
        <div class="field-compact field-compact-wide">
          <label>Schedule</label>
          <select data-field="preset">
            ${PRESETS.map(
              (p) =>
                `<option value="${p.key}" ${p.key === block.preset ? "selected" : ""}>${p.label}</option>`,
            ).join("")}
          </select>
        </div>
        ${
          preset.editableDays
            ? customFieldsHTML(block)
            : `<p class="field-compact-wide schedule-summary">${summary}</p>`
        }
      </div>
    </div>
  `;
}

function renderBlocks(): void {
  blocksContainer.innerHTML = blocks.map(blockCardHTML).join("");
}

blocksContainer.addEventListener("input", (e) => {
  const target = e.target as HTMLElement;
  const field = target.dataset.field;
  if (!field) return;
  const card = target.closest<HTMLElement>(".shift-block-card");
  const blockId = card?.dataset.blockId;
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return;

  if (field === "label") {
    block.label = (target as HTMLInputElement).value;
  } else if (field === "analysts" || field === "startHour" || field === "endHour") {
    const value = parseFloat((target as HTMLInputElement).value);
    (block as unknown as Record<string, number>)[field] = Number.isFinite(value)
      ? value
      : 0;
  }
  renderResults();
});

blocksContainer.addEventListener("change", (e) => {
  const target = e.target as HTMLElement;
  const field = target.dataset.field;
  if (!field) return;
  const card = target.closest<HTMLElement>(".shift-block-card");
  const blockId = card?.dataset.blockId;
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return;

  if (field === "utcOffsetHours") {
    block.utcOffsetHours = parseFloat((target as HTMLSelectElement).value);
    renderResults();
  } else if (field === "preset") {
    const presetKey = (target as HTMLSelectElement).value as SchedulePreset;
    const preset = getPreset(presetKey);
    block.preset = preset.key;
    block.daysOfWeek = [...preset.daysOfWeek];
    block.startHour = preset.startHour;
    block.endHour = preset.endHour;
    renderBlocks();
    renderResults();
  } else if (field.startsWith("day-")) {
    const dayIdx = parseInt(field.slice(4), 10);
    const checked = (target as HTMLInputElement).checked;
    if (checked && !block.daysOfWeek.includes(dayIdx)) {
      block.daysOfWeek.push(dayIdx);
    } else if (!checked) {
      block.daysOfWeek = block.daysOfWeek.filter((d) => d !== dayIdx);
    }
    renderResults();
  }
});

blocksContainer.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains("remove-block-btn")) return;
  const card = target.closest<HTMLElement>(".shift-block-card");
  const blockId = card?.dataset.blockId;
  if (!blockId || blocks.length <= 1) return;
  blocks = blocks.filter((b) => b.id !== blockId);
  renderBlocks();
  renderResults();
});

addBlockBtn.addEventListener("click", () => {
  blocks.push(
    createShiftBlock({
      label: `Crew ${blocks.length + 1}`,
      preset: "standard",
    }),
  );
  renderBlocks();
  renderResults();
});

function renderResults(): void {
  const result = computeCoverage(blocks);

  renderCoverageHeatmap(heatmapContainer, { grid: result.grid });

  coveragePctValueEl.textContent = `${numberFormatter.format(100 - result.pctGap)}%`;
  gapHoursValueEl.textContent = numberFormatter.format(result.zeroCoverageSlots * 0.5);
  minStaffedValueEl.textContent = numberFormatter.format(result.minStaffed);

  if (result.zeroCoverageSlots === 0) {
    gapSummaryEl.innerHTML = `
      <div class="status-badge">
        <span class="status-dot" style="background: var(--status-good)"></span>
        <div>
          <p class="status-label">Full 24/7 coverage achieved</p>
          <p class="status-description">Every hour of the week has at least one analyst on duty.</p>
        </div>
      </div>
    `;
  } else if (result.zeroCoverageSlots === result.totalSlots) {
    gapSummaryEl.innerHTML = `
      <div class="status-badge">
        <span class="status-dot" style="background: var(--status-critical)"></span>
        <div>
          <p class="status-label">No coverage at all</p>
          <p class="status-description">Add at least one crew with analysts on duty to see coverage.</p>
        </div>
      </div>
    `;
  } else {
    const items = result.gaps
      .map((g) => `<li>${formatGapWindow(g)} (${numberFormatter.format(g.slotCount * 0.5)}h)</li>`)
      .join("");
    gapSummaryEl.innerHTML = `
      <div class="status-badge">
        <span class="status-dot" style="background: var(--status-critical)"></span>
        <div>
          <p class="status-label">${result.gaps.length} gap window${result.gaps.length === 1 ? "" : "s"} found</p>
          <p class="status-description">These hours (UTC) have no one on duty:</p>
          <ul class="gap-list">${items}</ul>
        </div>
      </div>
    `;
  }
}

function planRowHTML(plan: CoveragePlan): string {
  const result = computeCoverage(plan.blocks);
  const coveragePct = numberFormatter.format(100 - result.pctGap);
  const statusGood = result.zeroCoverageSlots === 0;
  const chipColor = statusGood ? "var(--status-good)" : "var(--status-critical)";
  const statusLabel = statusGood ? "Full 24/7 coverage" : `${result.gaps.length} gap window${result.gaps.length === 1 ? "" : "s"}`;
  return `
    <div class="scenario-row" data-plan-id="${plan.id}">
      <div class="scenario-row-info">
        <p class="scenario-row-name">${escapeHtml(plan.name)}</p>
        <p class="scenario-row-meta">
          ${plan.blocks.length} crew${plan.blocks.length === 1 ? "" : "s"} &middot;
          ${coveragePct}% coverage &middot;
          <span class="status-chip"><span class="status-chip-dot" style="background:${chipColor}"></span>${statusLabel}</span>
        </p>
      </div>
      <div class="scenario-actions">
        <button type="button" class="load-plan-btn" data-plan-id="${plan.id}">Load</button>
        <button type="button" class="delete-plan-btn" data-plan-id="${plan.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderPlanList(): void {
  const plans = loadPlans();
  planList.innerHTML = plans.map(planRowHTML).join("");
  planEmptyHint.style.display = plans.length === 0 ? "block" : "none";
}

savePlanBtn.addEventListener("click", () => {
  const name = planNameInput.value.trim() || `Plan (${new Date().toLocaleString()})`;
  savePlan(name, blocks);
  planNameInput.value = "";
  renderPlanList();
});

planList.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const planId = target.dataset.planId;
  if (!planId) return;

  if (target.classList.contains("delete-plan-btn")) {
    deletePlan(planId);
    renderPlanList();
    return;
  }

  if (target.classList.contains("load-plan-btn")) {
    const plan = loadPlans().find((p) => p.id === planId);
    if (!plan) return;
    blocks = structuredClone(plan.blocks);
    renderBlocks();
    renderResults();
  }
});

renderBlocks();
renderResults();
renderPlanList();
