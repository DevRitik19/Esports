import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE } from "@/lib/staff-cookie";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const db = await createClient();
  await db.auth.signOut();
  const res = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  res.cookies.delete(STAFF_COOKIE);
  res.cookies.delete(`${STAFF_COOKIE}-checked`);
  return res;
}
