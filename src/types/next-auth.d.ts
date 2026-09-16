import type { UserRole, Language, TimeFormat } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface User {
    role?: UserRole;
    language?: Language;
    timeFormat?: TimeFormat;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      language: Language;
      timeFormat: TimeFormat;
    } & DefaultSessionUser;
  }
}

type DefaultSessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};
