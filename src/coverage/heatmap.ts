import { DAY_LABELS } from "./model";
import { SLOTS_PER_DAY, DAYS_PER_WEEK, formatSlotTime, type CoverageCell } from "./coverage";

const WIDTH = 820;
const ROW_HEIGHT = 24;
const MARGIN = { top: 20, right: 12, bottom: 8, left: 40 };
const CELL_GAP = 1.5;
const SEQ_STEPS = 12; // indices 0-12 (13 steps)

export interface HeatmapOptions {
  grid: CoverageCell[][];
}

export function renderCoverageHeatmap(
  container: HTMLElement,
  options: HeatmapOptions,
): void {
  const { grid } = options;
  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const colWidth = plotW / SLOTS_PER_DAY;
  const height = MARGIN.top + DAYS_PER_WEEK * ROW_HEIGHT + MARGIN.bottom;

  let maxValue = 0;
  for (const row of grid) {
    for (const cell of row) maxValue = Math.max(maxValue, cell.total);
  }

  const cellsHtml: string[] = [];
  for (let day = 0; day < DAYS_PER_WEEK; day++) {
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      const cell = grid[day][slot];
      const x = MARGIN.left + slot * colWidth + CELL_GAP / 2;
      const y = MARGIN.top + day * ROW_HEIGHT + CELL_GAP / 2;
      const w = colWidth - CELL_GAP;
      const h = ROW_HEIGHT - CELL_GAP;
      let fill: string;
      if (cell.total === 0) {
        fill = "var(--status-critical)";
      } else {
        const t = maxValue > 0 ? cell.total / maxValue : 0;
        const stepIdx = Math.max(1, Math.round(t * SEQ_STEPS));
        fill = `var(--seq-${stepIdx})`;
      }
      const fillOpacity = cell.total === 0 ? 0.16 : 1;
      cellsHtml.push(
        `<rect data-day="${day}" data-slot="${slot}" x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${h}" fill="${fill}" fill-opacity="${fillOpacity}" />`,
      );
    }
  }

  const dayLabels = DAY_LABELS.map(
    (label, day) =>
      `<text x="${MARGIN.left - 8}" y="${MARGIN.top + day * ROW_HEIGHT + ROW_HEIGHT / 2 + 4}" text-anchor="end" font-size="11" fill="var(--text-muted)">${label}</text>`,
  ).join("");

  const hourLabels: string[] = [];
  for (let slot = 0; slot < SLOTS_PER_DAY; slot += 4) {
    const x = MARGIN.left + slot * colWidth;
    hourLabels.push(
      `<text x="${x.toFixed(2)}" y="${MARGIN.top - 6}" text-anchor="start" font-size="10" fill="var(--text-muted)">${formatSlotTime(slot)}</text>`,
    );
  }

  container.innerHTML = `
    <div class="chart-wrap heatmap-wrap">
      <svg viewBox="0 0 ${WIDTH} ${height}" class="coverage-heatmap" role="img" aria-label="Weekly coverage heatmap by UTC hour">
        ${cellsHtml.join("")}
        ${dayLabels}
        ${hourLabels.join("")}
      </svg>
      <div class="chart-tooltip" style="display:none"></div>
    </div>
    <div class="heatmap-legend">
      <span class="heatmap-legend-swatch heatmap-legend-gap"></span> No coverage
      <span class="heatmap-legend-scale"></span>
      <span class="heatmap-legend-label">Fewer</span>
      <span class="heatmap-legend-gradient"></span>
      <span class="heatmap-legend-label">More analysts on duty</span>
    </div>
  `;

  const svg = container.querySelector("svg") as SVGSVGElement;
  const tooltip = container.querySelector(".chart-tooltip") as HTMLDivElement;

  function handleMove(clientX: number, clientY: number) {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * WIDTH;
    const py = ((clientY - rect.top) / rect.height) * height;
    if (
      px < MARGIN.left ||
      px > WIDTH - MARGIN.right ||
      py < MARGIN.top ||
      py > MARGIN.top + DAYS_PER_WEEK * ROW_HEIGHT
    ) {
      tooltip.style.display = "none";
      return;
    }
    const slot = Math.min(
      SLOTS_PER_DAY - 1,
      Math.floor((px - MARGIN.left) / colWidth),
    );
    const day = Math.min(
      DAYS_PER_WEEK - 1,
      Math.floor((py - MARGIN.top) / ROW_HEIGHT),
    );
    const cell = grid[day][slot];
    const timeLabel = `${DAY_LABELS[day]} ${formatSlotTime(slot)} UTC`;
    let text: string;
    if (cell.total === 0) {
      text = `${timeLabel}: no coverage`;
    } else {
      const names = Array.from(new Set(cell.contributors.map((c) => c.label)));
      text = `${timeLabel}: ${cell.total} on duty (${names.join(", ")})`;
    }
    tooltip.style.display = "block";
    tooltip.textContent = text;
    const leftPct = ((clientX - rect.left) / rect.width) * 100;
    tooltip.style.left = `${leftPct}%`;
    const topPx = ((clientY - rect.top) / rect.height) * height;
    tooltip.style.top = `${Math.max(topPx - 32, 0)}px`;
  }

  svg.addEventListener("mousemove", (e) => handleMove(e.clientX, e.clientY));
  svg.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
  svg.addEventListener("touchmove", (e) => {
    const touch = e.touches[0];
    if (touch) handleMove(touch.clientX, touch.clientY);
  });
}
