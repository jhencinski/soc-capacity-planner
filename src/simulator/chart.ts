import type { BacklogPoint } from "./simulation";

export interface ChartOptions {
  series: BacklogPoint[];
  horizonMinutes: number;
  spike?: { startDay: number; endDay: number } | null;
}

const WIDTH = 640;
const HEIGHT = 240;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 36 };

function niceMax(value: number): number {
  if (value <= 0) return 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  let niceNormalized;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;
  return niceNormalized * magnitude;
}

export function renderBacklogChart(
  container: HTMLElement,
  options: ChartOptions,
): void {
  const { series, horizonMinutes, spike } = options;
  const horizonDays = horizonMinutes / 1440;
  const lastMinutes = series.length
    ? series[series.length - 1].timeMinutes
    : horizonMinutes;
  const xMaxDays = Math.max(horizonDays, Math.ceil(lastMinutes / 1440));

  const peak = series.reduce((m, p) => Math.max(m, p.queueLength), 0);
  const yMax = niceMax(Math.max(peak * 1.15, 4));

  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const xScale = (days: number) => MARGIN.left + (days / xMaxDays) * plotW;
  const yScale = (q: number) => MARGIN.top + plotH - (q / yMax) * plotH;

  // Build a step-line path.
  let path = "";
  if (series.length > 0) {
    path = `M ${xScale(0)} ${yScale(series[0].queueLength)}`;
    for (let i = 1; i < series.length; i++) {
      const prevQ = series[i - 1].queueLength;
      const day = series[i].timeMinutes / 1440;
      path += ` L ${xScale(day)} ${yScale(prevQ)}`;
      path += ` L ${xScale(day)} ${yScale(series[i].queueLength)}`;
    }
    const lastQ = series[series.length - 1].queueLength;
    path += ` L ${xScale(xMaxDays)} ${yScale(lastQ)}`;
  }

  const yTicks = [0, yMax / 2, yMax];
  const xTickDays = [0, Math.round(xMaxDays / 2), Math.round(xMaxDays)];

  const spikeRect =
    spike && spike.endDay > spike.startDay
      ? `<rect x="${xScale(spike.startDay)}" y="${MARGIN.top}" width="${
          xScale(spike.endDay) - xScale(spike.startDay)
        }" height="${plotH}" fill="var(--status-serious)" opacity="0.12" />`
      : "";

  const gridlines = yTicks
    .map(
      (t) =>
        `<line x1="${MARGIN.left}" y1="${yScale(t)}" x2="${WIDTH - MARGIN.right}" y2="${yScale(t)}" stroke="var(--gridline)" stroke-width="1" />`,
    )
    .join("");

  const yLabels = yTicks
    .map(
      (t) =>
        `<text x="${MARGIN.left - 8}" y="${yScale(t) + 4}" text-anchor="end" font-size="11" fill="var(--text-muted)">${Math.round(t)}</text>`,
    )
    .join("");

  const xLabels = xTickDays
    .map(
      (d) =>
        `<text x="${xScale(d)}" y="${HEIGHT - 8}" text-anchor="middle" font-size="11" fill="var(--text-muted)">Day ${d}</text>`,
    )
    .join("");

  container.innerHTML = `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" class="backlog-chart" role="img" aria-label="Simulated backlog (queue length) over the month">
        ${spikeRect}
        ${gridlines}
        <line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${MARGIN.top + plotH}" stroke="var(--baseline)" stroke-width="1" />
        <line x1="${MARGIN.left}" y1="${MARGIN.top + plotH}" x2="${WIDTH - MARGIN.right}" y2="${MARGIN.top + plotH}" stroke="var(--baseline)" stroke-width="1" />
        <path d="${path}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        ${yLabels}
        ${xLabels}
        <line class="chart-crosshair" x1="0" y1="${MARGIN.top}" x2="0" y2="${MARGIN.top + plotH}" stroke="var(--text-muted)" stroke-width="1" style="display:none" />
      </svg>
      <div class="chart-tooltip" style="display:none"></div>
    </div>
  `;

  const svg = container.querySelector("svg") as SVGSVGElement;
  const crosshair = container.querySelector(".chart-crosshair") as SVGLineElement;
  const tooltip = container.querySelector(".chart-tooltip") as HTMLDivElement;

  function queueLengthAtDay(day: number): number {
    const minutes = day * 1440;
    let result = series.length ? series[0].queueLength : 0;
    for (const p of series) {
      if (p.timeMinutes > minutes) break;
      result = p.queueLength;
    }
    return result;
  }

  function handleMove(clientX: number, clientY: number) {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * WIDTH;
    if (px < MARGIN.left || px > WIDTH - MARGIN.right) {
      crosshair.style.display = "none";
      tooltip.style.display = "none";
      return;
    }
    const day = Math.round(((px - MARGIN.left) / plotW) * xMaxDays * 10) / 10;
    const q = queueLengthAtDay(day);
    crosshair.setAttribute("x1", String(px));
    crosshair.setAttribute("x2", String(px));
    crosshair.style.display = "block";
    tooltip.style.display = "block";
    tooltip.textContent = `Day ${day.toFixed(1)}: ${q} waiting`;
    const tooltipLeftPct = ((clientX - rect.left) / rect.width) * 100;
    tooltip.style.left = `${tooltipLeftPct}%`;
    const tooltipTopPx = ((clientY - rect.top) / rect.height) * HEIGHT;
    tooltip.style.top = `${Math.max(tooltipTopPx - 36, 0)}px`;
  }

  svg.addEventListener("mousemove", (e) => handleMove(e.clientX, e.clientY));
  svg.addEventListener("mouseleave", () => {
    crosshair.style.display = "none";
    tooltip.style.display = "none";
  });
  svg.addEventListener("touchmove", (e) => {
    const touch = e.touches[0];
    if (touch) handleMove(touch.clientX, touch.clientY);
  });
}
