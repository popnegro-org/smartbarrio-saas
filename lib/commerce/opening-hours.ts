export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type DayKey = (typeof DAYS)[number];
export type DayHours = { open: string; close: string; closed: boolean };
export type OpeningHours = Record<DayKey, DayHours>;

export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

const SCHEMA_DAYS: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function normalizeOpeningHours(value: unknown): OpeningHours {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(DAYS.map((day) => {
    const raw = source[day] && typeof source[day] === "object"
      ? source[day] as Record<string, unknown>
      : {};
    const open = typeof raw.open === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.open) ? raw.open : "09:00";
    const close = typeof raw.close === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.close) ? raw.close : "18:00";
    return [day, { open, close, closed: typeof raw.closed === "boolean" ? raw.closed : true }];
  })) as OpeningHours;
}

export function formatOpeningHoursText(value: unknown): string {
  const hours = normalizeOpeningHours(value);
  return DAYS.map((day) => {
    const item = hours[day];
    return DAY_LABELS[day] + ": " + (item.closed ? "cerrado" : item.open + "–" + item.close);
  }).join(" · ");
}

export function toOpeningHoursSpecification(value: unknown) {
  const hours = normalizeOpeningHours(value);
  return DAYS.flatMap((day) => {
    const item = hours[day];
    if (item.closed || item.open >= item.close) return [];
    return [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "https://schema.org/" + SCHEMA_DAYS[day],
      opens: item.open,
      closes: item.close,
    }];
  });
}
