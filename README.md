# Synthesis Workbench

One place for the whole review: library, screening, design-feature coding, effect extraction, and the analysis-ready dataset for the school-based behavioral health gap synthesis.

Stack: Next.js 15 (app router, server actions), Supabase (Postgres + private storage), Vercel. No client-side database access; the service role key stays on the server.

## Workflow the app enforces

1. Papers enter the library by PDF upload (text extracted, DOI detected, metadata from Crossref), by DOI, by RIS or CSV import from a database export, or by hand. Duplicates are skipped by DOI then exact title. Every paper keeps its source.
2. Title and abstract screening. Two independent decisions per paper. Each reviewer's decision is hidden until they have saved their own. All include advances the paper; all exclude excludes it; anything else is a conflict.
3. Full-text screening, same rule. Lack of results by race or income is not an exclusion reason; those papers stay in and are counted in the reporting audit.
4. Conflicts page lists disagreements; the agreed decision is recorded with the resolver's name and a note.
5. Code tab: design features (targeting level, cultural adaptation, delivery agent, dosage, design, risk of bias, composition, reporting level). One coding per coder; disagreements are marked side by side; one coding is marked final.
6. Effects tab: one row per outcome, group contrast and timepoint. Enter the group-by-arm cells, or the reported per-group effects, or the reported interaction term. The gap change delta and its variance are computed live, oriented so positive means the gap narrowed. Select text in the Text pane to capture the verbatim source and drop its numbers into fields. A second person verifies each row.
7. Dataset page: all rows joined with the final coding, the reporting audit tables, a codebook, and CSV download.

## Setup (once)

### 1. Supabase

1. Open your Supabase project.
2. SQL Editor -> New query.
3. Paste the whole of `supabase/schema.sql` and Run. This creates the tables, enables row-level security with no policies (so the anon key can read nothing), creates the private `pdfs` bucket, and seeds three names (Fan, Kim, Aaron). Edit the seed names first if needed; names can also be added from the login page.
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
git commit -m "Synthesis Workbench"
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
   - `TEAM_CODE` = optional. Leave unset for name-only login. If set, the login page asks for it once per browser.
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
d <- read.csv("gap_effects_verified_YYYY-MM-DD.csv")
m0 <- rma.mv(delta, var_delta, random = ~ 1 | paper_id / effect_id, data = d)
m1 <- rma.mv(delta, var_delta, mods = ~ targeting_level, random = ~ 1 | paper_id / effect_id, data = d)
```

Add `clubSandwich::coef_test(m1, vcov = "CR2")` for cluster-robust inference.
