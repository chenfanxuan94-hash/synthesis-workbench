import Back from "@/components/Back";
import AddPapers from "@/components/AddPapers";
import { requireMember } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function NewPaperPage() {
  await requireMember();
  return (
    <main className="center wide">
      <Back />
      <div className="eyebrow">Step 1</div>
      <h1>Add papers</h1>
      <AddPapers />
    </main>
  );
}
