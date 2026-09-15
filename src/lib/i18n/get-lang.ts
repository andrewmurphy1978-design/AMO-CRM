import { auth } from "@/lib/auth";
import type { Lang } from "./dictionaries";

// The signed-in user's own language preference drives the whole app's
// language — set once at login (JWT session), so a change made in Team
// settings takes effect the next time that person signs in.
export async function getLang(): Promise<Lang> {
  const session = await auth();
  return session?.user.language === "FR" ? "fr" : "en";
}
