import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword } from "@/lib/password";
import { withScopedPrismaClient } from "@/lib/prisma";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { finishLogin, readChallengeCookie, relyingParty } from "@/lib/passkey";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Required on platforms that don't run a traditional Node.js server
  // (Cloudflare Workers, Vercel Edge, behind some reverse proxies) — NextAuth
  // can't always verify the request's Host header itself there. Safe because
  // NEXTAUTH_URL/AUTH_URL is set explicitly by us, not derived from a header
  // an attacker could spoof.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await withScopedPrismaClient((db) =>
          db.user.findUnique({
            where: { email: email.toLowerCase().trim() },
          })
        );
        if (!user) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          language: user.language,
          timeFormat: user.timeFormat,
        };
      },
    }),
    // Face ID / fingerprint / Windows Hello: the login page gets a challenge from /api/passkey/login/options, the
    // device signs it, and the signed response is checked here (see src/lib/passkey.ts).
    Credentials({
      id: "passkey",
      name: "Passkey",
      credentials: { response: { type: "text" } },
      authorize: async (credentials, request) => {
        if (typeof credentials?.response !== "string") return null;
        let response: AuthenticationResponseJSON;
        try {
          response = JSON.parse(credentials.response) as AuthenticationResponseJSON;
        } catch {
          return null;
        }
        const { rpID, origin } = relyingParty(request.url);
        const user = await withScopedPrismaClient((db) =>
          finishLogin(db, { challengeId: readChallengeCookie(request.headers.get("cookie")), response, rpID, origin })
        );
        if (!user) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          language: user.language,
          timeFormat: user.timeFormat,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.language = user.language;
        token.timeFormat = user.timeFormat;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "MEMBER";
        session.user.language = (token.language as "EN" | "FR") ?? "EN";
        session.user.timeFormat = (token.timeFormat as "HOUR24" | "HOUR12") ?? "HOUR24";
      }
      return session;
    },
  },
});
