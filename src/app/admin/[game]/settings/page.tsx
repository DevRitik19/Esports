import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { gameOf } from "@/games/params";
import { GAME_IDS } from "@/games/registry";
import { CodmSettings } from "@/views/admin/CodmSettings";

export function generateStaticParams() {
  return GAME_IDS.map((game) => ({ game }));
}

export const metadata: Metadata = { title: "Settings" };

// Lobby games keep their settings per stage on Setup; only CODM has game-wide ones.
export default function GameSettingsPage({ params }: PageProps<"/admin/[game]/settings">) {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: Pick<PageProps<"/admin/[game]/settings">, "params">) {
  const game = gameOf((await params).game);
  if (game !== "codm") notFound();
  return <CodmSettings />;
}
