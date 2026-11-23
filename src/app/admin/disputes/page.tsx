import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GAMES } from "@/games/registry";
import { getDisputes } from "@/lib/admin";
import { requireStaff } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Disputes" };

export default function DisputesPage() {
  return (
    <Suspense fallback={<div className="panel h-64 animate-pulse" />}>
      <Disputes />
    </Suspense>
  );
}

/** Every game's disputes the viewer can rule on (RLS limits referees to their games). */
async function Disputes() {
  await requireStaff();
  const disputes = await getDisputes();
  const open = disputes.filter((d) => d.status === "open").length;
  return (
    <>
      <h1 className="font-display text-4xl">Disputes</h1>
      <p className="mt-1 text-sm text-muted">
        {open ? `${open} open. ` : "Nothing open. "}Rule within 30 minutes of a dispute being raised: open the match to resolve it.
      </p>
      {disputes.length === 0 ? (
        <p className="panel mt-6 p-5 text-sm text-muted">No disputes yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {disputes.map((d) => (
            <li key={d.id}>
              <Link
                href={d.href}
                className={`panel flex flex-wrap items-start gap-x-4 gap-y-2 p-4 hover:border-[var(--game)] ${d.status === "open" ? "" : "opacity-70"}`}
                style={{ "--game": GAMES[d.game].accent } as React.CSSProperties}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-xs text-faint">
                    <span className="size-2 bg-[var(--game)]" aria-hidden />
                    <span className="font-semibold text-text">{GAMES[d.game].short}</span>
                    <span className="font-cond">{d.matchId}</span>
                    <span>{d.teamId}</span>
                    <span>{fmtDateTime(d.createdAt)}</span>
                  </span>
                  <span className="text-sm">{d.reason}</span>
                  {d.resolution && <span className="text-sm text-muted">Ruling: {d.resolution}</span>}
                </span>
                <span className={`tag ${d.status === "open" ? "text-warn" : "text-muted"}`}>{d.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
