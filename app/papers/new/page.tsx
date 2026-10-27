import Back from "@/components/Back";
import PageTabs from "@/components/PageTabs";
import AddPapers from "@/components/AddPapers";
import { requireMember } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function NewPaperPage() {
  await requireMember();
  return (
    <main className="center wide">
      <Back />
      <PageTabs current="add" />
      <AddPapers />
    </main>
  );
}
