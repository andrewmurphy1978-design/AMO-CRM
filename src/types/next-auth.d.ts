import type { UserRole } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface User {
    role?: UserRole;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSessionUser;
  }
}

type DefaultSessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};
