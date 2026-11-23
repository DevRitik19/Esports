import { redirect } from "next/navigation";

/** The referee desk is the control room's Overview now. */
export default function RefPage() {
  redirect("/admin");
}
