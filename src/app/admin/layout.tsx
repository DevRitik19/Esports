import { Suspense } from "react";
import { GAME_LIST } from "@/games/registry";
import { canStaff, getViewer } from "@/lib/auth";
import { staffTags } from "@/lib/staff";
import { StaffNav, type StaffNavSection } from "./StaffNav";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="pt-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
      <aside className="mb-6 lg:mb-0">
        <Suspense fallback={<div className="h-10 lg:h-80" />}>
          <AdminNav />
        </Suspense>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Admins see every game and the staff tools; a referee sees only the games
 * on their tags. Pages check the same rules, and so does the database.
 */
async function AdminNav() {
  const viewer = await getViewer();
  if (!viewer?.staffRole) return null;
  const isAdmin = viewer.staffRole === "admin";
  const sections: StaffNavSection[] = [
    { items: [{ href: "/admin", label: "Overview" }] },
    {
      title: isAdmin ? "Games" : "Your games",
      items: GAME_LIST.filter((g) => canStaff(viewer, g.id)).map((g) => ({ href: `/admin/${g.id}`, label: g.name, accent: g.accent })),
    },
    {
      title: "Across games",
      items: [
        { href: "/admin/disputes", label: "Disputes" },
        { href: "/admin/sync", label: "Registrations" },
        ...(isAdmin ? [{ href: "/admin/announcements", label: "Announcements" }, { href: "/admin/staff", label: "Staff" }] : []),
        { href: "/admin/profile", label: "Your details" },
      ],
    },
  ];
  const tags = staffTags({ role: viewer.staffRole, games: viewer.staffGames ?? null });
  return (
    <StaffNav
      sections={sections}
      who={
        <>
          <p className="truncate">{viewer.email}</p>
          <p className="mt-2 flex flex-wrap gap-1">{tags.map((t) => <span key={t} className="tag text-steel">{t}</span>)}</p>
        </>
      }
    />
  );
}
