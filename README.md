# CHHSR Meta Analysis Portal

One place for the whole review: library, screening, design-feature coding, effect extraction, and the analysis-ready dataset for the school-based behavioral health gap synthesis.

The code folder and the GitHub repository are still called `synthesis-workbench`. Only the name shown on screen changed, so nothing needs to be renamed or reconnected.

Stack: Next.js 15 (app router, server actions), Supabase (Postgres + private storage), Vercel. No client-side database access; the service role key stays on the server.

## How the team works in it (version 4: search list, then master list)

1. Step 1, Search & screen. Keywords typed on the search page go to PubMed (E-utilities), OpenAlex, ERIC and Semantic Scholar at once; the app pulls titles and abstracts up to a chosen limit per database, shows how many each reported, merges the same paper found in several places (DOI, PubMed id, then normalised title), skips anything already in the library, and files the rest in the search list with which search found them. Every run is kept in a search log for the PRISMA diagram. Google Scholar, PsycINFO and Scopus have no usable API; their exports (RIS or CSV) are imported on the same page and screened with the rest. Each person marks a candidate Relevant, Not relevant or Unsure, from the row (click the title for the abstract) or one at a time with keyboard keys. One Relevant moves a paper to the master list; a Relevant against a Not relevant shows "Needs a decision" and anyone records it. An optional AI pre-screen leaves a likely / unlikely / unclear hint with a reason on each candidate, against criteria the team edits; people still mark every paper.
2. Papers can also enter the master list directly, by PDF upload (text extracted, DOI detected, metadata from Crossref), by DOI, by RIS or CSV import, or by hand. Duplicates are skipped by DOI then normalised title. Every paper keeps its source.
3. Everyone votes on each paper (Include, Exclude with a reason, or Not sure), with a seven-question checklist that suggests the vote. A paper is approved when two people vote Include and nobody votes Exclude, rejected when two vote Exclude and nobody votes Include; any other mix shows "Needs a decision"; the team talks it through and anyone records a final decision that overrides the votes. Votes are visible to everyone (set BLIND_VOTES=1 to hide others' votes until you have voted).
4. All papers is the master list: votes by person, status, coding progress, who last worked on each paper, and View / Edit / Code / Vote buttons. Filters by status, source, and free-text search.
5. Coding is one shared form per paper (study features) plus effect rows, editable by anyone; the app records who last saved, and every paper has a History. The team marks a paper done when the features and the numbers are in.
6. The study-features form can be filled by the AI model (Anthropic API) from the paper's text, with the sentence and page behind every value shown on hover and stored with the coding; the person checks each field. Effect rows can be drafted by the model from a screenshot of the results table (or from pages of the extracted text). The model only transcribes; the person checks every number and saves. Saved rows are flagged ai_assisted with the checker's name.
7. The dataset page downloads an Excel workbook (Effects, Papers, Search log, Codebook) with every effect row from the approved papers and the paper's coding attached; CSV is also available.

## Setup (once)

### 1. Supabase

1. Open your Supabase project.
2. SQL Editor -> New query.
3. Fresh install: paste the whole of `supabase/schema.sql` and Run. This creates the tables, enables row-level security with no policies (so the anon key can read nothing), creates the private `pdfs` bucket, and seeds three names (Fan, Kim, Aaron); is_pi marks who may bulk-delete papers from the list. Edit the seed names first if needed; names can also be added from the login page.
   Upgrading from an earlier version: paste `supabase/migrate_v3.sql` instead and Run. It adds the votes and activity tables and the new columns, and carries earlier screening decisions over as votes. Safe to run more than once. Then paste `supabase/migrate_v3b.sql` and Run: it adds the evidence column behind the AI fill of the study-features form. Then paste `supabase/migrate_v4.sql` and Run: it adds the search list (stage, found_by, keywords and the screening columns on papers; the screens, searches and settings tables). Existing papers stay in the master list.
4. Project Settings -> API: copy the Project URL and the `service_role` key.

### 2. GitHub

```
cd synthesis-workbench
```

```
git init
```

```
git add -A
```

```
git commit -m "CHHSR Meta Analysis Portal"
```

Create an empty repository on GitHub, then:

```
git remote add origin https://github.com/YOUR-USER/synthesis-workbench.git
```

```
git push -u origin main
```

### 3. Vercel

1. New Project -> import the GitHub repository. Framework is detected as Next.js.
2. Environment Variables (Production):
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = the service_role key
   - `ANTHROPIC_API_KEY` = an API key from console.anthropic.com, for AI drafts of effect rows. Optional; without it the draft button says it is not set up.
   - `ANTHROPIC_MODEL` = optional, defaults to `claude-opus-5-5` (the most careful reader of tables). `claude-sonnet-5-5` is faster and about half the cost (a full-paper read is roughly 25 cents with Opus, 12 with Sonnet, at the prices listed on platform.claude.com in late 2026).
   - `ANTHROPIC_EFFORT` = optional, defaults to `medium`. How hard the model thinks before answering: `low`, `medium`, `high`, `xhigh` or `max`. Higher is slower and costs more per paper.
   - `NCBI_API_KEY`, `OPENALEX_API_KEY`, `S2_API_KEY`, `CONTACT_EMAIL` = optional. The step 1 searches work without any of them; the keys only raise rate limits (Semantic Scholar throttles anonymous use and sometimes answers "busy"), and the contact address is sent to NCBI and OpenAlex as the polite-use contact.
   - `TEAM_CODE` = optional. Leave unset for name-only login. If set, the login page asks for it once per browser.
   - `BLIND_VOTES` = optional. Set to `1` to hide other people's votes on a paper until you have voted.
3. Deploy. Open the URL, pick your name.

### 4. Vercel function timeout

The paper page and the search page allow a function to run for 300 seconds (`maxDuration` in `app/papers/[id]/page.tsx` and `app/search/page.tsx`), because the AI reads a whole paper from the one and a search asks four databases from the other. That is Vercel's default limit with Fluid compute, which is on for new projects on every plan. If a deploy fails with a message about the maximum duration, turn on Fluid compute (Settings -> Functions) or lower that number to 60. PDF text extraction runs on the server after upload and fits in the ordinary limit.

## Local development

```
npm install
```

```
cp .env.example .env.local
```

Fill in `.env.local`, then:

```
npm run dev
```

## Notes on security

- Login is name-only by design. Anyone who has the URL can pick a name. Set `TEAM_CODE` if the URL may leak, or protect the deployment with Vercel's password protection.
- The Supabase anon key is never shipped to the browser, and RLS is enabled with no policies, so the tables cannot be read through Supabase's public API.
- PDFs are in a private bucket and served through one-hour signed URLs.
- The AI model receives only what the person sends: the screenshot or the selected pages of text, plus the paper's title. Nothing is stored on Anthropic's side by the app; the drafted rows live only in the browser until a person saves them.

## Effect size computation

Implemented in `lib/effects.ts` and documented in the codebook on the Dataset page.

- Continuous cells: g for each group = (treatment mean - control mean) / S, where S is the control-arm SD pooled across both groups; Hedges' correction applied; variance (n_t + n_c)/(n_t n_c) + g^2 / (2(n_t + n_c)).
- Binary cells: risk difference and log risk ratio per group (absolute and relative scales), plus log odds ratio converted to d (sqrt(3)/pi) so binary rows share the SMD scale. 0.5 continuity correction when a cell is zero.
- Reported per-group effects: used as given with their SEs.
- Reported interaction: coefficient and SE used directly; raw-scale rows are flagged.
- Orientation: when higher is worse, every group effect is multiplied by -1, so positive always means improvement.
- delta = g_m - g_c; var_delta = var_m + var_c. Positive delta means the marginalized group benefited more: the gap narrowed.

## Analysis starting point (R)

```
library(metafor)
d <- readxl::read_excel("chhsr_meta_dataset_YYYY-MM-DD.xlsx", sheet = "Effects")
m0 <- rma.mv(delta, var_delta, random = ~ 1 | paper_id / effect_id, data = d)
m1 <- rma.mv(delta, var_delta, mods = ~ targeting_level, random = ~ 1 | paper_id / effect_id, data = d)
```

Add `clubSandwich::coef_test(m1, vcov = "CR2")` for cluster-robust inference.
