export type SchedulePreset =
  | "standard"
  | "4x10-sun-wed"
  | "4x10-wed-sat"
  | "panama-day"
  | "panama-night"
  | "custom";

export interface ShiftBlock {
  id: string;
  label: string;
  analysts: number;
  utcOffsetHours: number;
  preset: SchedulePreset;
  daysOfWeek: number[]; // 0 = Sunday ... 6 = Saturday, in the block's LOCAL time
  startHour: number; // local hour, 0-24, .5 increments allowed
  endHour: number; // local hour; if <= startHour, the shift wraps past local midnight
}

export interface PresetDefinition {
  key: SchedulePreset;
  label: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  editableDays: boolean;
}

export const PRESETS: PresetDefinition[] = [
  {
    key: "standard",
    label: "Standard 8-hour (Mon–Fri)",
    daysOfWeek: [1, 2, 3, 4, 5],
    startHour: 8,
    endHour: 16,
    editableDays: false,
  },
  {
    key: "4x10-sun-wed",
    label: "4×10 (Sun–Wed)",
    daysOfWeek: [0, 1, 2, 3],
    startHour: 7,
    endHour: 17,
    editableDays: false,
  },
  {
    key: "4x10-wed-sat",
    label: "4×10 (Wed–Sat)",
    daysOfWeek: [3, 4, 5, 6],
    startHour: 7,
    endHour: 17,
    editableDays: false,
  },
  {
    key: "panama-day",
    label: "Panama schedule (day crew)",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startHour: 6,
    endHour: 18,
    editableDays: false,
  },
  {
    key: "panama-night",
    label: "Panama schedule (night crew)",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startHour: 18,
    endHour: 6,
    editableDays: false,
  },
  {
    key: "custom",
    label: "Custom",
    daysOfWeek: [1, 2, 3, 4, 5],
    startHour: 8,
    endHour: 16,
    editableDays: true,
  },
];

export function getPreset(key: SchedulePreset): PresetDefinition {
  return PRESETS.find((p) => p.key === key) ?? PRESETS[0];
}

export interface UtcOffsetOption {
  value: number;
  label: string;
}

export const UTC_OFFSETS: UtcOffsetOption[] = [
  { value: -8, label: "UTC−8 (Los Angeles)" },
  { value: -7, label: "UTC−7 (Denver)" },
  { value: -6, label: "UTC−6 (Chicago / Mexico City)" },
  { value: -5, label: "UTC−5 (New York / Toronto)" },
  { value: -3, label: "UTC−3 (São Paulo)" },
  { value: 0, label: "UTC+0 (London)" },
  { value: 1, label: "UTC+1 (Berlin / Lagos)" },
  { value: 2, label: "UTC+2 (Cairo / Johannesburg)" },
  { value: 3, label: "UTC+3 (Moscow / Riyadh)" },
  { value: 5.5, label: "UTC+5:30 (Mumbai / Bangalore)" },
  { value: 7, label: "UTC+7 (Bangkok / Jakarta)" },
  { value: 8, label: "UTC+8 (Singapore / Beijing / Manila)" },
  { value: 9, label: "UTC+9 (Tokyo / Seoul)" },
  { value: 10, label: "UTC+10 (Sydney)" },
  { value: 12, label: "UTC+12 (Auckland)" },
];

let idCounter = 0;
export function createShiftBlock(overrides: Partial<ShiftBlock> = {}): ShiftBlock {
  const preset = getPreset(overrides.preset ?? "standard");
  idCounter += 1;
  return {
    id: `block-${Date.now()}-${idCounter}`,
    label: "New crew",
    analysts: 3,
    utcOffsetHours: -5,
    preset: preset.key,
    daysOfWeek: [...preset.daysOfWeek],
    startHour: preset.startHour,
    endHour: preset.endHour,
    ...overrides,
  };
}

export function defaultShiftBlocks(): ShiftBlock[] {
  return [
    createShiftBlock({
      label: "US Day Crew",
      analysts: 4,
      utcOffsetHours: -5,
      preset: "standard",
    }),
  ];
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
