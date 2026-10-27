import Nav from "@/components/Nav";
import AddPapers from "@/components/AddPapers";
import { requireMember } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function NewPaperPage() {
  const me = await requireMember();
  return (
    <>
      <Nav me={me} active="new" />
      <main>
        <h1>Add papers</h1>
        <AddPapers />
      </main>
    </>
  );
}
