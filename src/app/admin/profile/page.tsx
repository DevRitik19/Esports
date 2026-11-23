import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/ActionForm";
import { StaffContactFields } from "@/components/StaffContactFields";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveMyProfile } from "../actions";

export const metadata: Metadata = { title: "Your details" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="panel h-64 animate-pulse" />}>
      <Profile />
    </Suspense>
  );
}

/** The signed-in staff member's own details, shown on their games' pages. */
async function Profile() {
  const viewer = await requireStaff();
  const db = await createClient();
  const { data } = await db.from("staff").select("name, phone, discord, listed").eq("email", viewer.email.toLowerCase()).maybeSingle();
  const me = (data ?? {}) as { name?: string | null; phone?: string | null; discord?: string | null; listed?: boolean };
  return (
    <>
      <h1 className="font-display text-4xl">Your details</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Team leaders of your games see these under Referees, so they can reach you about a match. Everyone else only sees your name.
      </p>
      <section className="panel mt-6 p-5">
        <ActionForm action={saveMyProfile} submit="Save details" className="flex flex-col gap-4">
          <StaffContactFields name={me.name} phone={me.phone} discord={me.discord} listed={me.listed ?? true} />
        </ActionForm>
      </section>
    </>
  );
}
