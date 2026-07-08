import { DAY_LABELS, type ShiftBlock } from "./model";

export const SLOTS_PER_DAY = 48; // 30-minute resolution
export const DAYS_PER_WEEK = 7;

export interface CellContributor {
  blockId: string;
  label: string;
  analysts: number;
}

export interface CoverageCell {
  day: number; // UTC day, 0=Sun
  slot: number; // UTC half-hour slot, 0-47
  total: number;
  contributors: CellContributor[];
}

export interface GapWindow {
  startDay: number;
  startSlot: number;
  endDay: number;
  endSlot: number;
  slotCount: number;
}

export interface CoverageResult {
  grid: CoverageCell[][]; // [day][slot]
  totalSlots: number;
  zeroCoverageSlots: number;
  pctGap: number;
  minStaffed: number;
  gaps: GapWindow[];
}

function wrapDaySlot(day: number, slot: number): { day: number; slot: number } {
  let d = day;
  let s = slot;
  while (s < 0) {
    s += SLOTS_PER_DAY;
    d -= 1;
  }
  while (s >= SLOTS_PER_DAY) {
    s -= SLOTS_PER_DAY;
    d += 1;
  }
  d = ((d % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return { day: d, slot: s };
}

function localSlotsForBlock(block: ShiftBlock): { day: number; slot: number }[] {
  const startSlot = Math.round(block.startHour * 2);
  const endSlot = Math.round(block.endHour * 2);
  const overnight = endSlot <= startSlot;
  const slots: { day: number; slot: number }[] = [];

  for (const day of block.daysOfWeek) {
    if (!overnight) {
      for (let s = startSlot; s < endSlot; s++) slots.push({ day, slot: s });
    } else {
      for (let s = startSlot; s < SLOTS_PER_DAY; s++) slots.push({ day, slot: s });
      const nextDay = (day + 1) % DAYS_PER_WEEK;
      for (let s = 0; s < endSlot; s++) slots.push({ day: nextDay, slot: s });
    }
  }
  return slots;
}

export function computeCoverage(blocks: ShiftBlock[]): CoverageResult {
  const grid: CoverageCell[][] = Array.from({ length: DAYS_PER_WEEK }, (_, day) =>
    Array.from({ length: SLOTS_PER_DAY }, (_, slot) => ({
      day,
      slot,
      total: 0,
      contributors: [],
    })),
  );

  for (const block of blocks) {
    if (block.analysts <= 0) continue;
    const offsetSlots = Math.round(block.utcOffsetHours * 2);
    const localSlots = localSlotsForBlock(block);
    for (const { day, slot } of localSlots) {
      const utc = wrapDaySlot(day, slot - offsetSlots);
      const cell = grid[utc.day][utc.slot];
      cell.total += block.analysts;
      cell.contributors.push({
        blockId: block.id,
        label: block.label,
        analysts: block.analysts,
      });
    }
  }

  const totalSlots = DAYS_PER_WEEK * SLOTS_PER_DAY;
  let zeroCoverageSlots = 0;
  let minStaffed = Infinity;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.total === 0) zeroCoverageSlots++;
      if (cell.total < minStaffed) minStaffed = cell.total;
    }
  }
  if (!Number.isFinite(minStaffed)) minStaffed = 0;

  const gaps = findGapWindows(grid);

  return {
    grid,
    totalSlots,
    zeroCoverageSlots,
    pctGap: (zeroCoverageSlots / totalSlots) * 100,
    minStaffed,
    gaps,
  };
}

function findGapWindows(grid: CoverageCell[][]): GapWindow[] {
  // Flatten into week-order sequence (Sun 00:00 -> Sat 23:30), then find runs of zero coverage.
  const flat: { day: number; slot: number; total: number }[] = [];
  for (let day = 0; day < DAYS_PER_WEEK; day++) {
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      flat.push({ day, slot, total: grid[day][slot].total });
    }
  }

  const n = flat.length;
  const isZero = flat.map((c) => c.total === 0);
  if (isZero.every((z) => z)) {
    return [
      {
        startDay: 0,
        startSlot: 0,
        endDay: 6,
        endSlot: SLOTS_PER_DAY - 1,
        slotCount: n,
      },
    ];
  }
  if (isZero.every((z) => !z)) return [];

  // Rotate the start so we begin at a non-zero->zero boundary, to correctly merge
  // a gap that wraps across the Sat 23:30 -> Sun 00:00 week boundary.
  let rotateBy = 0;
  for (let i = 0; i < n; i++) {
    if (isZero[i] && !isZero[(i - 1 + n) % n]) {
      rotateBy = i;
      break;
    }
  }
  const rotated = flat.map((_, i) => flat[(i + rotateBy) % n]);
  const rotatedZero = rotated.map((c) => c.total === 0);

  const gaps: GapWindow[] = [];
  let i = 0;
  while (i < n) {
    if (!rotatedZero[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && rotatedZero[j]) j++;
    gaps.push({
      startDay: rotated[i].day,
      startSlot: rotated[i].slot,
      endDay: rotated[j - 1].day,
      endSlot: rotated[j - 1].slot,
      slotCount: j - i,
    });
    i = j;
  }
  return gaps;
}

export function formatSlotTime(slot: number): string {
  const hour = Math.floor(slot / 2);
  const minute = slot % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function formatGapWindow(gap: GapWindow): string {
  const startLabel = `${DAY_LABELS[gap.startDay]} ${formatSlotTime(gap.startSlot)}`;
  // End is inclusive of the last zero slot; display the boundary as the slot after it ends.
  const endSlotExclusive = gap.endSlot + 1;
  const endDay = endSlotExclusive >= SLOTS_PER_DAY ? (gap.endDay + 1) % DAYS_PER_WEEK : gap.endDay;
  const endSlotWrapped = endSlotExclusive % SLOTS_PER_DAY;
  const endLabel = `${DAY_LABELS[endDay]} ${formatSlotTime(endSlotWrapped)}`;
  return `${startLabel}–${endLabel} UTC`;
}
