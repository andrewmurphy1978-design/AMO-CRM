import type { UserRole, Language } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface User {
    role?: UserRole;
    language?: Language;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      language: Language;
    } & DefaultSessionUser;
  }
}

type DefaultSessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};
