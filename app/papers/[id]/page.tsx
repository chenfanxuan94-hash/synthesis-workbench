import { notFound, redirect } from "next/navigation";
import Workspace, { type PanelTab } from "@/components/Workspace";
import { db } from "@/lib/supabase";
import { requireMember, allMembers } from "@/lib/session";
import { isTask } from "@/lib/steps";
import { loadLibrary } from "@/lib/library";
import { aiConfigured } from "@/lib/claude";
import type { Activity, Coding, Effect, Paper, Vote } from "@/lib/types";

export const dynamic = "force-dynamic";
// The AI reads a whole paper from this page; Opus takes a minute or two, so allow five.
// (That is Vercel's own default with Fluid compute; see README section 4.)
export const maxDuration = 300;

const TABS: PanelTab[] = ["overview", "vote", "code", "effects", "edit"];

export default async function PaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { task, tab } = await searchParams;
  const t = isTask(task) ? task : null;
  const me = await requireMember();
  const members = await allMembers();
  const d = db();
  const [{ data: paper }, { data: votes }, { data: codings }, { data: effects }, { data: activity }] = await Promise.all([
    d.from("papers").select("*").eq("id", id).maybeSingle(),
    d.from("votes").select("*").eq("paper_id", id),
    d.from("codings").select("*").eq("paper_id", id).order("updated_at", { ascending: false }),
    d.from("effects").select("*").eq("paper_id", id).order("created_at"),
    d.from("activity").select("*").eq("paper_id", id).order("created_at", { ascending: false }).limit(60),
  ]);
  if (!paper) notFound();
  // A candidate still in the search list is screened on its own page, not in the workspace.
  if ((paper as Paper).stage === "search") redirect(`/search/screen?id=${id}`);
  // One shared coding per paper. If an older version left two, the latest saved (or the done one) counts.
  const cs = ((codings || []) as Coding[]);
  const coding = cs.find((c) => c.done) || cs[0] || null;
  const left = t ? (await loadLibrary(me.id)).mine[t].length : null;
  const initialTab = (TABS as string[]).includes(tab || "") ? (tab as PanelTab) : null;
  return (
    <main className="full">
      <Workspace
        key={`${id}-${t ?? "none"}-${initialTab ?? ""}`}
        task={t}
        left={left}
        initialTab={initialTab}
        paper={paper as Paper}
        me={me}
        members={members}
        votes={(votes || []) as Vote[]}
        coding={coding}
        effects={(effects || []) as Effect[]}
        activity={(activity || []) as Activity[]}
        blind={process.env.BLIND_VOTES === "1"}
        aiReady={aiConfigured()}
      />
    </main>
  );
}
