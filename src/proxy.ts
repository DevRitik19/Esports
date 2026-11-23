import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase session cookie fresh on the signed-in areas.
// Public pages are cached and never read the session, so they're excluded.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  // The header's staff hint (see lib/staff-cookie): set once for people who
  // signed in before it existed, so admins see "Admin" without logging in again.
  if (data.user && !request.cookies.has("yg-staff") && !request.cookies.has("yg-staff-checked")) {
    const [admin, staff] = await Promise.all([supabase.rpc("is_admin"), supabase.rpc("is_staff")]);
    const role = admin.data ? "admin" : staff.data ? "referee" : undefined;
    const month = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 30 };
    if (role) response.cookies.set("yg-staff", role, month);
    else response.cookies.set("yg-staff-checked", "1", month);
  }
  return response;
}

export const config = {
  matcher: ["/me/:path*", "/admin/:path*", "/ref/:path*", "/login"],
};
