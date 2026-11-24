export const PUSH_CATEGORIES = ["briefing", "email", "calendar", "contact", "sms", "social", "invoice"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];
