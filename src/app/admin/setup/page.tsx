import { redirect } from "next/navigation";

/** CODM setup lives under CODM now. */
export default function OldSetup() {
  redirect("/admin/codm/setup");
}
