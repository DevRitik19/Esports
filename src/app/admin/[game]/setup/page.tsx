import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { gameOf } from "@/games/params";
import { GAME_IDS, GAMES } from "@/games/registry";
import { CodmSetup } from "@/views/admin/CodmSetup";
import { LobbyAdmin } from "@/views/admin/LobbyAdmin";

export function generateStaticParams() {
  return GAME_IDS.map((game) => ({ game }));
}

export const metadata: Metadata = { title: "Setup" };

export default function GameSetupPage({ params }: PageProps<"/admin/[game]/setup">) {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: Pick<PageProps<"/admin/[game]/setup">, "params">) {
  const game = gameOf((await params).game);
  if (game === "codm") return <CodmSetup />;
  if (GAMES[game].shape === "lobby") return <LobbyAdmin game={game} view="setup" />;
  notFound();
}
