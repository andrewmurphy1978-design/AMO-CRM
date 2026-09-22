// Google Calendar's own named event colors (colorId -> hex), shared by
// every calendar view in the app (the Dashboard's 3-day grid/table and the
// full multi-view Calendar page) so an event always looks the same color
// wherever it's shown. No colorId on an event means it uses the calendar's
// own color, which for a primary calendar is Google's default blue.
export const GOOGLE_EVENT_COLORS: Record<string, { bg: string; fg: string }> = {
  "1": { bg: "#7986cb", fg: "#fff" }, // Lavender
  "2": { bg: "#33b679", fg: "#fff" }, // Sage
  "3": { bg: "#8e24aa", fg: "#fff" }, // Grape
  "4": { bg: "#e67c73", fg: "#fff" }, // Flamingo
  "5": { bg: "#f6bf26", fg: "#000" }, // Banana
  "6": { bg: "#f4511e", fg: "#fff" }, // Tangerine
  "7": { bg: "#039be5", fg: "#fff" }, // Peacock
  "8": { bg: "#616161", fg: "#fff" }, // Graphite
  "9": { bg: "#3f51b5", fg: "#fff" }, // Blueberry
  "10": { bg: "#0b8043", fg: "#fff" }, // Basil
  "11": { bg: "#d50000", fg: "#fff" }, // Tomato
};
export const DEFAULT_EVENT_COLOR = { bg: "#4285f4", fg: "#fff" }; // Google's default calendar blue

export function eventColor(colorId: string | null): { bg: string; fg: string } {
  return (colorId && GOOGLE_EVENT_COLORS[colorId]) || DEFAULT_EVENT_COLOR;
}

// For the event dialog's color picker — Google's own names for each id, in
// the same order Google Calendar's own UI lists them.
export const EVENT_COLOR_OPTIONS: { id: string; name: string }[] = [
  { id: "1", name: "Lavender" },
  { id: "2", name: "Sage" },
  { id: "3", name: "Grape" },
  { id: "4", name: "Flamingo" },
  { id: "5", name: "Banana" },
  { id: "6", name: "Tangerine" },
  { id: "7", name: "Peacock" },
  { id: "8", name: "Graphite" },
  { id: "9", name: "Blueberry" },
  { id: "10", name: "Basil" },
  { id: "11", name: "Tomato" },
];
