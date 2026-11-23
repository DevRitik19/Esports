import "server-only";
import { cookies } from "next/headers";
import type { createClient } from "./supabase/server";

/**
 * A hint for the header, set at login: "admin" or "referee" for staff, so
 * the header can offer the control room without an auth call on every
 * public page. Only a label; every staff page and the database check access.
 */
export const STAFF_COOKIE = "yg-staff";

/** Call from a server action after sign-in. */
export async function rememberStaffRole(db: Awaited<ReturnType<typeof createClient>>): Promise<void> {
  const [admin, staff] = await Promise.all([db.rpc("is_admin"), db.rpc("is_staff")]);
  const role = admin.data ? "admin" : staff.data ? "referee" : undefined;
  const jar = await cookies();
  const month = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 30 };
  if (role) jar.set(STAFF_COOKIE, role, month);
  else jar.delete(STAFF_COOKIE);
  // Checked either way, so the proxy doesn't ask again.
  jar.set(`${STAFF_COOKIE}-checked`, "1", month);
}
