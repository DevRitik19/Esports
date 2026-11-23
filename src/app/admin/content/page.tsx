import { redirect } from "next/navigation";

/** CODM settings live under CODM now; announcements have their own page. */
export default function OldContent() {
  redirect("/admin/codm/settings");
}
