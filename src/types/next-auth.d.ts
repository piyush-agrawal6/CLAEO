import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Bumped on password reset; mismatch invalidates the session. */
      sessionVersion: number;
    } & DefaultSession["user"];
  }

  interface User {
    sessionVersion?: number;
  }
}

declare module "@auth/jwt" {
  interface JWT {
    id?: string;
    sessionVersion?: number;
  }
}
