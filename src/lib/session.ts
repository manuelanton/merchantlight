import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface AdminSession {
  isAdmin: boolean;
  charName: string;
  loggedInAt: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "merchantlight-windhelm-eastmarch-change-me-32chars!!",
  cookieName: "merchantlight_admin",
  cookieOptions: { secure: process.env.NODE_ENV === "production" },
};

export async function getAdminSession(): Promise<AdminSession & { save: () => Promise<void>; destroy: () => void }> {
  const cookieStore = await cookies();
  // Next 16 cookies() is structurally compatible with iron-session's CookieStore — bypass strict overload typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getIronSession<AdminSession>(cookieStore as any, sessionOptions);
  if (session.isAdmin === undefined) (session as unknown as Record<string, unknown>).isAdmin = false;
  return session as AdminSession & { save: () => Promise<void>; destroy: () => void };
}

export async function requireAdmin() {
  const s = await getAdminSession();
  if (!s.isAdmin) throw new Error("UNAUTHORIZED");
  return s;
}
