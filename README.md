# CHHSR Meta Analysis Portal

One place for the whole review: library, screening, design-feature coding, effect extraction, and the analysis-ready dataset for the school-based behavioral health gap synthesis.

The code folder and the GitHub repository are still called `synthesis-workbench`. Only the name shown on screen changed, so nothing needs to be renamed or reconnected.

Stack: Next.js 15 (app router, server actions), Supabase (Postgres + private storage), Vercel. No client-side database access; the service role key stays on the server.

## How the team works in it (version 3: one master list)

1. Papers enter the library by PDF upload (text extracted, DOI detected, metadata from Crossref), by DOI, by RIS or CSV import from a database export, or by hand. Duplicates are skipped by DOI then exact title. Every paper keeps its source.
2. Everyone votes on each paper (Include, Exclude with a reason, or Not sure), with a seven-question checklist that suggests the vote. A paper is approved when two people vote Include and nobody votes Exclude, rejected when two vote Exclude and nobody votes Include; any other mix shows "PI decides" and the PI records a decision that overrides the votes. Votes are visible to everyone (set BLIND_VOTES=1 to hide others' votes until you have voted).
3. All papers is the master list: votes by person, status, coding progress, who last worked on each paper, and View / Edit / Code / Vote buttons. Filters by status, source, and free-text search.
4. Coding is one shared form per paper (study features) plus effect rows, editable by anyone; the app records who last saved, and every paper has a History. The team marks a paper done when the features and the numbers are in.
5. Effect rows can be drafted by Claude from a screenshot of the results table (or from pages of the extracted text). Claude only transcribes; the person checks every number and saves. Saved rows are flagged ai_assisted with the checker's name.
6. The dataset page downloads an Excel workbook (Effects, Papers, Codebook) with every effect row from the approved papers and the paper's coding attached; CSV is also available.

## Setup (once)

### 1. Supabase

1. Open your Supabase project.
2. SQL Editor -> New query.
3. Fresh install: paste the whole of `supabase/schema.sql` and Run. This creates the tables, enables row-level security with no policies (so the anon key can read nothing), creates the private `pdfs` bucket, and seeds three names (Fan as PI, Kim, Aaron). Edit the seed names first if needed; names can also be added from the login page.
   Upgrading from an earlier version: paste `supabase/migrate_v3.sql` instead and Run. It adds the votes and activity tables and the new columns, and carries earlier screening decisions over as votes. Safe to run more than once.
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
   - `ANTHROPIC_API_KEY` = an API key from console.anthropic.com, for Claude drafts of effect rows. Optional; without it the draft button says it is not set up.
   - `ANTHROPIC_MODEL` = optional, defaults to `claude-sonnet-5-5`.
   - `TEAM_CODE` = optional. Leave unset for name-only login. If set, the login page asks for it once per browser.
   - `BLIND_VOTES` = optional. Set to `1` to hide other people's votes on a paper until you have voted.
3. Deploy. Open the URL, pick your name.

### 4. Vercel function timeout

PDF text extraction runs on the server after upload. On the Pro plan the default function limit is enough for ordinary papers. If a very long PDF fails at "reading text", set Settings -> Functions -> Max Duration to 60 seconds.

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
- Claude receives only what the person sends: the screenshot or the selected pages of text, plus the paper's title. Nothing is stored on Anthropic's side by the app; the drafted rows live only in the browser until a person saves them.

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
