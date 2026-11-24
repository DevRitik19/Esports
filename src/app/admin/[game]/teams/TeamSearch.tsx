"use client";

import { useState } from "react";
import { inputClass } from "@/components/ActionForm";

/** Narrows a list whose rows carry data-name="<lowercase name and tag>". */
export function TeamSearch({ scope }: { scope: string }) {
  const [q, setQ] = useState("");
  // Only letters, digits and spaces reach the selector.
  const term = q.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  return (
    <>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams" aria-label="Search teams" className={`${inputClass} max-w-xs`} />
      {term && <style>{`[data-list="${scope}"] [data-name]:not([data-name*="${term}"]) { display: none; }`}</style>}
    </>
  );
}
