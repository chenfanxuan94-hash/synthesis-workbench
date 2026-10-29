import Link from "next/link";
import Back from "@/components/Back";
import { markGuideRead } from "@/lib/actions";
import { requireMember } from "@/lib/session";
import { stepByNumber } from "@/lib/steps";
import { RULE } from "@/lib/status";

export const dynamic = "force-dynamic";

// Plain-language guide for new team members. Edit the text here; it is the only copy.

export default async function GuidePage() {
  await requireMember();
  return (
    <main className="center guide">
      <Back />
      <h1>Guide</h1>
      <p className="muted">
        Jump to: <a href="#steps">the steps</a> &middot; <a href="#search">finding papers</a> &middot; <a href="#example">the worked example</a> &middot; <a href="#ai">AI-assisted drafts</a> &middot; <a href="#words">words you will see</a> &middot; <a href="#faq">common questions</a>
      </p>

      <h2 id="project">The project in plain words</h2>
      <div className="card">
        <p>
          Many schools run programs for students&apos; mental health and behavior, such as counseling groups, social-emotional learning lessons, or therapy at school.
          Researchers have tested hundreds of these programs by comparing students who got the program with students who did not.
        </p>
        <p>
          Black students, Latinx students, and students from lower-income families are less likely to get mental health care, more likely to drop out of care, and more likely to be suspended.
          We want to know which kinds of school programs help these students <b>more</b> than they help White or higher-income students, because a program like that makes the gap between groups smaller.
        </p>
        <p style={{ marginBottom: 0 }}>
          Our job is to find the published studies, decide which ones fit, record what kind of program each one tested, and copy the numbers that let us measure whether the gap got smaller.
          The app does all of the math.
        </p>
      </div>

      <h2 id="rules">Rules everyone follows</h2>
      <div className="card">
        <ol style={{ margin: 0, paddingLeft: 22 }}>
          <li><b>Two lists.</b> The <b>search list</b> (step 1) holds everything the database searches found; it is screened from the title and abstract. The <b>master list</b> (All papers) holds the papers that passed; they are voted on from the full text, then coded. Nothing is ever deleted by screening; a screened-out record stays in the search list under its own filter.</li>
          <li><b>Two votes decide.</b> {RULE}</li>
          <li><b>When in doubt, include.</b> A second person always looks too. If people disagree, the paper shows <b>Needs a decision</b>: talk it through as a team and record the decision on the paper&apos;s Edit details tab. Say in the note what you could not tell.</li>
          <li><b>Do not exclude a paper because it has no results by race or income.</b> We keep those papers and count them; that count is one of the project&apos;s findings.</li>
          <li><b>Copy numbers exactly as printed.</b> Do not round, average, or calculate anything. The app does the math. AI drafts are suggestions: check every number against the paper before saving.</li>
          <li><b>Every number needs its source.</b> Record the page, the table name, and paste the sentence or table row the numbers came from.</li>
          <li><b>Coding is shared.</b> One form per paper that anyone can edit. The app records who saved last, and the History on each paper shows every change.</li>
          <li><b>When you are stuck, write a note and move on.</b> Guessing is worse than flagging.</li>
        </ol>
      </div>

      <h2 id="steps">The steps</h2>
      <p>Home shows these steps in order. The big colored card on Home always opens the next paper waiting for you, with instructions on the screen.</p>

      <StepCard n={1}>
        <p><b>What to do:</b> On the <b>Search &amp; screen</b> page, type keywords and click <b>Search</b>. The app asks PubMed, OpenAlex, ERIC and Semantic Scholar, pulls the titles and abstracts, merges the same paper found twice, and lists everything that is new. Then screen: click a title to read its abstract right there and mark it <b>Relevant</b>, <b>Not relevant</b> or <b>Unsure</b>. <b>Screen one by one</b> shows one candidate at a time with the keys R, N, U and S. Papers you already know go in with the <b>+ Add papers</b> button (a DOI, an RIS or CSV export, a PDF).</p>
        <p style={{ marginBottom: 0 }}><b>Done when:</b> every candidate has a mark. One Relevant moves a paper to the master list (All papers); the full text is checked there, so when in doubt say Relevant. See <a href="#search">finding papers</a> below for how to write a good search and what the app cannot search.</p>
      </StepCard>

      <StepCard n={2}>
        <p><b>What to do:</b> Find the PDF (the paper&apos;s DOI link, Google Scholar, the library) and drop it on the paper&apos;s <b>Edit details</b> tab. Read it, or the abstract if there is no PDF yet. Answer the seven yes/no questions in the checklist; the app suggests a vote from your answers. Pick <b>Include</b>, <b>Exclude</b> (with the first rule it fails), or <b>Not sure</b>, add a note if helpful, then click <b>Save my vote</b> and <b>Next paper</b>.</p>
        <p style={{ marginBottom: 0 }}><b>Remember:</b> your vote is saved and the paper stays in All papers. It becomes <b>Approved</b> once two people vote Include with nobody voting Exclude. If people disagree, it shows <b>Needs a decision</b>; the team talks it through and anyone records the decision on the paper. You can change your vote any time.</p>
      </StepCard>

      <StepCard n={3}>
        <p><b>What to do:</b> Approved papers come to you one at a time. The page opens on the <b>Code</b> tab: fill in the study features (what kind of study, who the program was for, whether it was adapted for a cultural group, who delivered it, how long it ran, who was in the sample, and how the results are reported). Then open <b>Effect sizes</b> and copy the numbers by group: either paste a screenshot of the results table and let the AI draft the rows, or add rows by hand. Check every number. When the features and the numbers are both in, click <b>Mark this paper done</b>.</p>
        <p style={{ marginBottom: 0 }}><b>Done when:</b> the paper shows <b>done</b> in All papers. Anyone can still open it and fix something later; the History shows who changed what.</p>
      </StepCard>

      <StepCard n={4}>
        <p style={{ marginBottom: 0 }}>The dataset page downloads one Excel file with every effect row from the approved papers, the paper&apos;s coding attached, a Papers sheet with everyone&apos;s votes, a Search log sheet with every database search (for the PRISMA diagram), and a codebook.</p>
      </StepCard>

      <h2 id="search">Finding papers (step 1)</h2>
      <div className="card">
        <p><b>Where the app searches.</b> PubMed (medicine and health), OpenAlex (250 million works across every field; the closest free equivalent to Google Scholar), ERIC (education research, including school programs and dissertations) and Semantic Scholar (broad, with citation counts). Each search goes to every ticked database at once; the app pulls up to the limit you chose per database, shows how many each one reported, merges the same paper found in several places, and skips anything already in the library.</p>
        <p><b>What it cannot search, and what to do instead.</b> Google Scholar has no interface for programs and blocks them, and PsycINFO, Scopus and Web of Science need a paid licence. Use the <b>Open the same search elsewhere</b> links under the search box to run your exact query there by hand, then bring results in through <b>+ Add papers</b>: export RIS or CSV from PsycINFO or Scopus, use the free Publish or Perish program to export a Google Scholar search, or add single papers by DOI. Those records are screened like the rest and counted as added by hand in the PRISMA table.</p>
        <p><b>The keyword bank.</b> Under the search box, the bank lists every query anyone has run: who, when, which databases, how many records it found, how many were new, and how many of its candidates moved to the master list, which is the number that says whether a keyword pays off. The terms used so far appear as chips, so missing synonyms stand out. <b>Keywords to try</b> is a shared to-do list: add a keyword or a whole query with a note, and it is ticked off by itself once someone runs it. Typing a query that was already run shows a note with its earlier result; running it again only picks up records the databases have added since.</p>
        <p><b>Writing the query.</b> Build it from blocks joined with AND, each block a list of synonyms joined with OR, and put phrases in quotes. For example: <span className="mono">(&quot;school-based&quot; OR school OR classroom) AND (&quot;mental health&quot; OR counseling OR &quot;social emotional&quot; OR mindfulness OR behavior) AND (randomized OR &quot;control group&quot; OR &quot;quasi-experimental&quot;)</span>. Keep it broad: screening is cheap, missing a paper is not. Run several narrower searches rather than one enormous one, and set the year range if the protocol has one. Every run is kept in the search log with its counts, which is what the methods section and the PRISMA diagram need.</p>
        <p><b>Screening.</b> Read the title and the abstract and ask one thing: could this paper possibly meet the criteria? If yes or unsure, mark <b>Relevant</b>; the Vote step reads the full text and decides properly. Mark <b>Not relevant</b> only when the abstract clearly fails a rule (another country, no comparison group, adults, not a school program, a review). <b>Unsure</b> leaves it for a teammate. One Relevant moves a paper to the master list; if one person says Relevant and another Not relevant, the candidate shows <b>Needs a decision</b> and anyone records the decision after a word with the team. A paper moved by mistake can be sent back from its Edit details tab.</p>
        <p style={{ marginBottom: 0 }}><b>AI pre-screen.</b> Optional. The AI reads every unscreened title and abstract against the criteria written on the search page and leaves a hint: likely, unlikely or unclear, with one line of reasoning. Sort by the hint to read the likely ones first, and spot-check a sample of the unlikely ones before marking them Not relevant in bulk. The hint is never a decision and nothing moves until a person marks it; the record of who marked what is always a person&apos;s name.</p>
      </div>

      <h2 id="example">Worked example: copying numbers (step 3)</h2>
      <div className="card">
        <p>A paper says:</p>
        <div className="note warn" style={{ fontStyle: "italic" }}>
          &quot;Black students in the program attended 8.4 sessions on average (SD = 3.1, n = 112), compared with 5.2 sessions (SD = 2.8, n = 108) for Black students in the control group.
          White students in the program attended 13.0 sessions (SD = 2.9, n = 140), compared with 11.1 (SD = 3.0, n = 131) in the control group.&quot; (page 9)
        </div>
        <p><b>How to fill the form</b> (sections A to D, top to bottom):</p>
        <ol style={{ paddingLeft: 22 }}>
          <li><b>Section A.</b> Outcome family: <b>Service engagement</b>. Outcome measure: <b>sessions attended</b>. Kind of number: <b>Means and SDs</b>. Time point: <b>post-test</b>.</li>
          <li><b>Section A.</b> Higher is worse?: <b>No, higher is better</b> (more sessions is good). For depression scores or suspensions you would choose Yes.</li>
          <li><b>Section B.</b> Groups: <b>Black vs. White</b>. <b>Section C.</b> What the paper gives you: <b>Numbers for each group in each condition</b>.</li>
          <li><b>Section C.</b> Fill the twelve boxes exactly like this:</li>
        </ol>
        <table className="grid" style={{ maxWidth: 640, margin: "6px 0 12px" }}>
          <thead>
            <tr><th></th><th>Got the program: n</th><th>mean</th><th>SD</th><th>Did not (control): n</th><th>mean</th><th>SD</th></tr>
          </thead>
          <tbody>
            <tr><th>Black</th><td>112</td><td>8.4</td><td>3.1</td><td>108</td><td>5.2</td><td>2.8</td></tr>
            <tr><th>White</th><td>140</td><td>13.0</td><td>2.9</td><td>131</td><td>11.1</td><td>3.0</td></tr>
          </tbody>
        </table>
        <ol start={5} style={{ paddingLeft: 22 }}>
          <li><b>Section D.</b> Page: <b>9</b>. Paste the sentence into Copied text. Click <b>Save effect</b>.</li>
        </ol>
        <div className="computed" style={{ marginTop: 6 }}>
          <b>What the green Result box shows:</b> the program helped Black students by about 1.10 and White students by about 0.65 (in standard units).
          The difference, <b>delta = 0.44</b>, is positive, which means Black students gained more than White students: the gap in sessions attended got smaller.
          A negative delta would mean the gap got bigger.
        </div>
      </div>

      <h2 id="ai">AI-assisted drafts of the numbers</h2>
      <div className="card">
        <p>In the <b>Effect sizes</b> tab, click <b>Draft the rows with AI</b>. Take a screenshot of the results table in the PDF (on a Mac: hold Shift, Command and 4, then drag over the table; on Windows: Windows key, Shift and S), paste it into the box with Command-V (Windows: Ctrl-V), and click <b>Draft the rows</b>. Within a minute or so the AI lists the rows it found, with the page and the sentence it read them from.</p>
        <p>Click <b>Use this row</b>: the form opens already filled in, with a yellow note at the top. Compare every number with the paper, fix anything wrong, and click <b>Save effect</b>. Rows saved this way are marked <b>AI draft</b> with your name as the person who checked them.</p>
        <p style={{ marginBottom: 0 }}>The AI only copies what is printed. It can misread a column or mix up which group is which, so the check is not optional. If the table is scanned and blurry, it will say so; type those numbers by hand. If the paper is text, you can also ask it to read a page range instead of a screenshot.</p>
      </div>

      <details className="fold" id="words">
        <summary>Words you will see</summary>
        <dl>
          <dt>Paper or study</dt><dd>One published article that tested a program.</dd>
          <dt>Program (intervention)</dt><dd>The thing being tested, for example a ten-week counseling group.</dd>
          <dt>Treatment group</dt><dd>Students who got the program. In the form this column is labeled Got the program (treatment).</dd>
          <dt>Control group</dt><dd>Students who did not get the program (or got the usual services). In the form this column is labeled Did not (control).</dd>
          <dt>Randomized (RCT)</dt><dd>Students or schools were assigned to the program by chance, like a coin flip. The strongest kind of study.</dd>
          <dt>Quasi-experiment</dt><dd>No coin flip, but the authors compared against a similar group that did not get the program. Also eligible.</dd>
          <dt>Outcome</dt><dd>What was measured to see if the program worked, for example depression scores, sessions attended, or suspensions.</dd>
          <dt>Marginalized group</dt><dd>The group facing the barrier: Black students, Latinx students, or lower-income students. Shown as <b>m</b> in the app.</dd>
          <dt>Comparison group</dt><dd>The group we compare them with: White students or higher-income students. Shown as <b>c</b>. <b>This is not the control group.</b> Control means &quot;did not get the program&quot;; comparison means &quot;the other racial or income group&quot;.</dd>
          <dt>Gap</dt><dd>The difference between the marginalized group and the comparison group on an outcome.</dd>
          <dt>Approved, Rejected, Needs votes, Needs a decision</dt><dd>The status of a paper, worked out from the votes. {RULE}</dd>
          <dt>Done</dt><dd>The team marked the paper&apos;s coding finished. It leaves the to-do list but can still be edited.</dd>
          <dt>n</dt><dd>Number of students in a group. Example: n = 112.</dd>
          <dt>Mean (M)</dt><dd>The average score. Example: M = 8.4.</dd>
          <dt>SD</dt><dd>Standard deviation, a number that says how spread out the scores are. Papers print it next to the mean, for example &quot;M = 8.4, SD = 3.1&quot;. You only copy it.</dd>
          <dt>Events</dt><dd>For yes/no outcomes: how many students had the thing happen, for example 14 of 120 students were suspended. 14 is the events, 120 is the n.</dd>
          <dt>Effect size (d or g)</dt><dd>A single number for how much the program helped. Some papers print it per group; then you copy it with its standard error (SE).</dd>
          <dt>Subgroup results</dt><dd>Results reported separately for each group, for example one table for Black students and one for White students. These are the papers we need numbers from.</dd>
          <dt>Interaction</dt><dd>A statistics term. A &quot;treatment by race interaction&quot; tells whether the program worked differently for different groups. If a paper reports one, copy the coefficient and its SE.</dd>
        </dl>
      </details>

      <details className="fold">
        <summary>Where things are in a research paper</summary>
        <dl>
          <dt>Abstract</dt><dd>The summary at the top. Often enough for your vote.</dd>
          <dt>Method (or Methods)</dt><dd>Who took part, where, how they were assigned, and what the program was. Most of the study features come from here.</dd>
          <dt>Participants or Table 1</dt><dd>Ages, grades, and the percent of students by race, ethnicity, and income.</dd>
          <dt>Results</dt><dd>The numbers. Look for sentences or tables that split results by group (for example &quot;Among Black students...&quot;).</dd>
          <dt>Tables</dt><dd>Most numbers you copy are in tables. Read the table title and footnotes so you know what each column means.</dd>
          <dt>Supplementary materials</dt><dd>An online appendix. Results by group are sometimes only here. The link is usually on the journal page.</dd>
        </dl>
      </details>

      <details className="fold" id="faq">
        <summary>Common questions</summary>
        <dl>
          <dt>I marked a candidate Relevant and it vanished from the search list</dt><dd>It moved to the master list (All papers), which is what Relevant means. Open All papers to find it; its source line says &quot;screened in&quot;. If that was a mistake, its Edit details tab has <b>Send back to the search list</b>.</dd>
          <dt>I voted and the paper is gone</dt><dd>It is not. Open All papers: your vote shows as a colored chip next to the paper, and the paper is approved once a second person votes Include. The Home page only lists what still needs you.</dd>
          <dt>The search found thousands of records</dt><dd>The app pulls up to the limit you chose per database and says how many the database reported. Narrow the query (add a block with AND, set years) and run again; or raise the limit to 1000 and screen in bulk with the AI hints and the Not relevant button on ticked rows.</dd>
          <dt>A paper came up with no abstract</dt><dd>Some databases do not share abstracts. Click the record links under the title (doi.org, PubMed, Google Scholar) to read it there, then mark it here.</dd>
          <dt>The PDF area is blank</dt><dd>Click <b>Open in new tab</b> above it, or switch to the Text view. If a PDF is missing, open the <b>Edit details</b> tab and upload it. Scanned papers have no text, so the Text view stays empty; read them in the PDF view and use screenshots for the AI drafts.</dd>
          <dt>I cannot find the full text</dt><dd>Try Google Scholar (click All versions), the university library, or the first author&apos;s website. If none work, write a note on the paper so the team knows.</dd>
          <dt>I made a mistake</dt><dd>Change your vote and save it again. Coding and effect rows can be edited by anyone at any time; the History on the paper&apos;s Overview shows who changed what.</dd>
          <dt>Someone else already coded the paper</dt><dd>Good: the form is shared. Read what is there, fix anything wrong, and save. Your name is recorded as the last person to save.</dd>
          <dt>The paper reports adjusted and unadjusted results</dt><dd>Enter the numbers from the authors&apos; main analysis, and copy the other version into Notes. If it is not clear which is the main one, say so in the note.</dd>
          <dt>Several time points</dt><dd>Add one row per time point. Write &quot;post-test&quot; for the end of the program and &quot;follow-up 6 mo&quot; (and so on) for later ones.</dd>
          <dt>The groups are named differently</dt><dd>&quot;African American&quot; counts as Black, &quot;Hispanic&quot; as Latinx, and &quot;free or reduced-price lunch&quot; as lower-income. For any other contrast choose Other and type the names.</dd>
          <dt>Only one group is in the study</dt><dd>For example all Black students. Code it and mark Single-group sample: Yes. There is no gap to extract from it, so set the reporting level accordingly and mark it done.</dd>
        </dl>
      </details>

      <form action={markGuideRead} className="mt" style={{ textAlign: "center" }}>
        <button type="submit" className="primary big">I have read this. Take me Home &rarr;</button>
      </form>
    </main>
  );
}

function StepCard({ n, children }: { n: number; children: React.ReactNode }) {
  const s = stepByNumber(n);
  return (
    <div className="gstep">
      <div className="head">
        <span className="stepnum">{n}</span>
        <b>{s.title}</b>
        <span className="muted">({s.who})</span>
        <Link className="btn small primary" href={s.href} style={{ marginLeft: "auto" }}>{s.go}</Link>
      </div>
      {children}
    </div>
  );
}
