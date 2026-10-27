import Link from "next/link";
import Back from "@/components/Back";
import { markGuideRead } from "@/lib/actions";
import { requireMember } from "@/lib/session";
import { STEPS } from "@/lib/steps";

export const dynamic = "force-dynamic";

// Plain-language guide for new team members (step 0). Edit the text here; it is the only copy.

export default async function GuidePage() {
  await requireMember();
  return (
    <main className="center guide">
      <Back />
      <div className="eyebrow">Step 0</div>
      <h1>Read this first</h1>
      <p className="lead">
        About fifteen minutes. It explains the project, the words you will see, and exactly what to do at each step.
        Come back any time you are unsure, or ask Fan.
      </p>
      <p className="muted">
        Jump to: <a href="#steps">the steps</a> &middot; <a href="#example">the worked example</a> &middot; <a href="#words">words you will see</a> &middot; <a href="#faq">common questions</a>
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
          <li><b>Decide on your own.</b> Two people screen each paper without talking first. The app hides the other person&apos;s decision until you save yours. Please do not discuss a paper until you have both saved.</li>
          <li><b>At the abstract step, when in doubt, include.</b> An abstract is short and leaves things out. The full-text step is where we are strict.</li>
          <li><b>Do not exclude a paper because it has no results by race or income.</b> We keep those papers and count them; that count is one of the project&apos;s findings.</li>
          <li><b>Copy numbers exactly as printed.</b> Do not round, average, or calculate anything. The app does the math.</li>
          <li><b>Every number needs its source.</b> Record the page, the table name, and paste the sentence or table row the numbers came from.</li>
          <li><b>When you are stuck, write a note and move on.</b> Use the Notes box, pick Unsure if you are screening, and tell Fan. Guessing is worse than flagging.</li>
        </ol>
      </div>

      <h2 id="steps">The steps</h2>
      <p>Home shows these steps in order. The big colored card on Home always opens the next paper waiting for you, with instructions on the screen.</p>

      <StepCard n={1}>
        <p><b>What to do:</b> Drop PDF files into the big box. The app reads each file, finds its DOI (the paper&apos;s ID number), and fills in the title, authors, and year. To bring in search results from PsycINFO, ERIC, or PubMed, export them as RIS and use the <b>Import RIS or CSV</b> tab. Choose the Source under the box so we know where each paper came from.</p>
        <p style={{ marginBottom: 0 }}><b>Done when:</b> the papers appear under All papers.</p>
      </StepCard>

      <StepCard n={2}>
        <p><b>What to do:</b> Read the title and the abstract. Answer the seven yes/no questions in the checklist (the app suggests a decision from your answers). Check the decision buttons, add a note if helpful, then click <b>Save my decision</b> and <b>Next paper</b>.</p>
        <p style={{ marginBottom: 0 }}><b>Remember:</b> when in doubt, include. Expect about one to two minutes per paper.</p>
      </StepCard>

      <StepCard n={3}>
        <p><b>What to do:</b> The PDF opens on the left. If there is no PDF yet, find the paper (Google Scholar, the university library, or ask Fan), then upload it in the <b>PDF and details</b> tab on the right. Read the Method section and answer the same checklist, this time strictly. If any answer is No, the paper is excluded with that reason. Save, then Next paper.</p>
        <p style={{ marginBottom: 0 }}><b>Remember:</b> papers without results by race or income still pass this step if they meet the rules.</p>
      </StepCard>

      <StepCard n={4}>
        <p style={{ marginBottom: 0 }}><b>What to do:</b> These are papers where the two screeners did not agree, or someone chose Unsure. Meet with the other screener, open the paper, read both reasons, agree on the answer, and click <b>Agreed: include</b> or <b>Agreed: exclude</b> with a short note on why.</p>
      </StepCard>

      <StepCard n={5}>
        <p><b>What to do:</b> The page opens on the <b>Code</b> tab. Fill in the form from the paper: what kind of study, who the program was for, whether it was adapted for a cultural group, who delivered it, how long it ran, and who was in the sample. Each section says where in a paper the answer usually is. Hover over any <b>?</b> for a definition. Leave a field blank if the paper does not say. The last section, <b>Reporting level</b>, is the most important: it tells us whether there are numbers to copy in step 6.</p>
        <p style={{ marginBottom: 0 }}><b>Done when:</b> you click Save my coding. Two people code each paper; differences are highlighted for Fan to settle.</p>
      </StepCard>

      <StepCard n={6}>
        <p><b>What to do:</b> The page opens on the <b>Effects</b> tab. Only papers whose reporting level says they report results by group come to this step. Find the table or sentence with results by group. Click <b>Add effect</b>, then fill in the form from top to bottom: which outcome, whether higher is better or worse, which groups, and the numbers. To copy numbers quickly, switch the left side to <b>Text</b>, select the sentence with your mouse, and click each number in the yellow box to drop it into the outlined field. Click <b>Use as quote</b> to store the sentence. One row per outcome, per group contrast, per time point.</p>
        <p style={{ marginBottom: 0 }}><b>Done when:</b> the green Result box shows a number for each row and you have saved them. See the worked example below.</p>
      </StepCard>

      <StepCard n={7}>
        <p style={{ marginBottom: 0 }}><b>What to do:</b> You only see rows that someone else entered. For each row, go to the page and table it lists. Check every number against the paper, and check that Higher is worse is set correctly. If all correct, click <b>Everything matches - mark as checked</b>. If something is wrong, fix it, save, and tell the person who entered it. (Editing removes the old check, so a third look happens automatically.)</p>
      </StepCard>

      <StepCard n={8}>
        <p style={{ marginBottom: 0 }}><b>Usually Fan.</b> The dataset page lists every row with the paper&apos;s coding attached, shows how many papers report results by group, and downloads everything as a spreadsheet for analysis.</p>
      </StepCard>

      <h2 id="example">Worked example: copying numbers (step 6)</h2>
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
          <dt>Abstract</dt><dd>The summary at the top. Used in step 2.</dd>
          <dt>Method (or Methods)</dt><dd>Who took part, where, how they were assigned, and what the program was. Most of step 3 and step 5 come from here.</dd>
          <dt>Participants or Table 1</dt><dd>Ages, grades, and the percent of students by race, ethnicity, and income.</dd>
          <dt>Results</dt><dd>The numbers. Look for sentences or tables that split results by group (for example &quot;Among Black students...&quot;).</dd>
          <dt>Tables</dt><dd>Most numbers you copy are in tables. Read the table title and footnotes so you know what each column means.</dd>
          <dt>Supplementary materials</dt><dd>An online appendix. Results by group are sometimes only here. The link is usually on the journal page.</dd>
        </dl>
      </details>

      <details className="fold" id="faq">
        <summary>Common questions</summary>
        <dl>
          <dt>The PDF area is blank</dt><dd>Click <b>Open in new tab</b> above it, or switch to the Text view. If a PDF is missing, open the <b>PDF and details</b> tab and upload it again. Scanned papers have no text, so the Text view stays empty; read them in the PDF view and type the numbers.</dd>
          <dt>I cannot find the full text</dt><dd>Try Google Scholar (click All versions), the university library, or the first author&apos;s website. If none work, write a note and tell Fan.</dd>
          <dt>I made a mistake</dt><dd>You can change your own screening or coding at any time: change the answer and click Update. For an effect row, click Edit.</dd>
          <dt>The paper reports adjusted and unadjusted results</dt><dd>Enter the numbers from the authors&apos; main analysis, and copy the other version into Notes. Ask Fan if it is not clear which is the main one.</dd>
          <dt>Several time points</dt><dd>Add one row per time point. Write &quot;post-test&quot; for the end of the program and &quot;follow-up 6 mo&quot; (and so on) for later ones.</dd>
          <dt>The groups are named differently</dt><dd>&quot;African American&quot; counts as Black, &quot;Hispanic&quot; as Latinx, and &quot;free or reduced-price lunch&quot; as lower-income. For any other contrast choose Other and type the names.</dd>
          <dt>Only one group is in the study</dt><dd>For example all Black students. Code it (step 5) and mark Single-group sample: Yes. There is no gap to extract from it, so it will not come to step 6.</dd>
        </dl>
      </details>

      <form action={markGuideRead} className="mt" style={{ textAlign: "center" }}>
        <button type="submit" className="primary big">I have read this. Take me Home &rarr;</button>
      </form>
    </main>
  );
}

function StepCard({ n, children }: { n: number; children: React.ReactNode }) {
  const s = STEPS[n];
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
