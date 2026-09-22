// Shared between the event view/edit dialogs — Google Calendar reminders
// are always a list (the calendar's own defaults, or up to 5 custom
// overrides), so both dialogs need the same "list of minutes -> readable
// text" formatting rather than each re-implementing it.
export interface ReminderLabels {
  reminderNone: string;
  reminderAtTime: string;
  reminderMinutesBefore: string; // "{n} minutes before"
  reminderHourBefore: string; // "{n} hour before"
  reminderHoursBefore: string; // "{n} hours before"
  reminderDayBefore: string; // "{n} day before"
  reminderDaysBefore: string; // "{n} days before"
}

export function formatReminderMinutes(n: number, labels: ReminderLabels): string {
  if (n <= 0) return labels.reminderAtTime;
  if (n < 60) return labels.reminderMinutesBefore.replace("{n}", String(n));
  if (n < 1440) {
    const hours = n / 60;
    return (hours === 1 ? labels.reminderHourBefore : labels.reminderHoursBefore).replace("{n}", String(hours));
  }
  const days = n / 1440;
  return (days === 1 ? labels.reminderDayBefore : labels.reminderDaysBefore).replace("{n}", String(days));
}

export function formatReminderList(minutesList: number[], labels: ReminderLabels): string {
  if (minutesList.length === 0) return labels.reminderNone;
  return minutesList.map((m) => formatReminderMinutes(m, labels)).join(", ");
}

// Google Calendar's own reminder preset list (its "Add notification"
// dropdown offers exactly these).
export const REMINDER_MINUTE_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];

export const MAX_REMINDER_OVERRIDES = 5; // Google Calendar API's own cap
