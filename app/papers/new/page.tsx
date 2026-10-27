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
        <h1>Step 1: Add papers</h1>
        <div className="guide-card">
          <ol style={{ margin: 0 }}>
            <li><b>Have PDFs?</b> Use Upload PDFs. Pick a Source first, then choose the files. Title, authors, and year fill in by themselves.</li>
            <li><b>Have search results from a database</b> (PsycINFO, ERIC, PubMed, ProQuest)? Export them as RIS, then use Import RIS or CSV.</li>
            <li><b>Have only a DOI or a reference?</b> Use By DOI, or Manual entry and click Find on Crossref.</li>
            <li>Papers already in the library are skipped automatically, so adding the same paper twice is harmless.</li>
          </ol>
        </div>
        <AddPapers />
      </main>
    </>
  );
}
