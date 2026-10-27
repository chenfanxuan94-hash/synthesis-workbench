import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Workspace from "@/components/Workspace";
import { db } from "@/lib/supabase";
import { requireMember, allMembers } from "@/lib/session";
import type { Coding, Effect, Paper, Screening } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember();
  const members = await allMembers();
  const d = db();
  const [{ data: paper }, { data: screenings }, { data: codings }, { data: effects }] = await Promise.all([
    d.from("papers").select("*").eq("id", id).maybeSingle(),
    d.from("screenings").select("*").eq("paper_id", id),
    d.from("codings").select("*").eq("paper_id", id),
    d.from("effects").select("*").eq("paper_id", id).order("created_at"),
  ]);
  if (!paper) notFound();
  return (
    <>
      <Nav me={me} active="papers" />
      <main className="full">
        <Workspace
          paper={paper as Paper}
          me={me}
          members={members}
          screenings={(screenings || []) as Screening[]}
          codings={(codings || []) as Coding[]}
          effects={(effects || []) as Effect[]}
        />
      </main>
    </>
  );
}
