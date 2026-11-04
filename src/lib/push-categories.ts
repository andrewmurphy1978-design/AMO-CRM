export const PUSH_CATEGORIES = ["email", "calendar", "contact", "sms", "social", "invoice"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];
