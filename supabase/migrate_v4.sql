-- CHHSR Meta Analysis Portal: migration to version 4 (step 1: find and screen papers).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run more than once.
-- Coming from a version before 3, run migrate_v3.sql (and migrate_v3b.sql) first.

-- Every paper is either a candidate in the search list ('search') or in the master list ('master').
-- Papers that exist already stay where they are: the master list.
alter table papers add column if not exists stage text not null default 'master';
alter table papers drop constraint if exists papers_stage_check;
alter table papers add constraint papers_stage_check check (stage in ('search', 'master'));

-- Where a record came from and what the databases said about it.
alter table papers add column if not exists found_by jsonb;        -- [{q, db, at, id}] one entry per search that returned it
alter table papers add column if not exists keywords jsonb;        -- subject terms from the database (MeSH, ERIC descriptors, OpenAlex keywords)
alter table papers add column if not exists pmid text;
alter table papers add column if not exists external_ids jsonb;    -- {openalex, eric, semanticscholar, pubmed}
alter table papers add column if not exists cited_by int;
alter table papers add column if not exists title_key text;        -- normalised title, to spot the same paper from two databases

-- Title-and-abstract screening: a recorded decision when people disagree, and when the paper moved on.
alter table papers add column if not exists screen_decision text;
alter table papers drop constraint if exists papers_screen_decision_check;
alter table papers add constraint papers_screen_decision_check check (screen_decision in ('in', 'out'));
alter table papers add column if not exists screen_by uuid references members(id);
alter table papers add column if not exists screen_at timestamptz;
alter table papers add column if not exists screened_in_at timestamptz;
alter table papers add column if not exists ai_screen jsonb;       -- {verdict, reason, at, model}: the AI's hint, never a decision

update papers set title_key = left(regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', '', 'g'), 200) where title_key is null;
update papers set doi = lower(doi) where doi is not null and doi <> lower(doi);

create index if not exists papers_stage_idx on papers (stage);
create index if not exists papers_title_key_idx on papers (title_key);
create index if not exists papers_pmid_idx on papers (pmid);

-- One screening mark per candidate x team member.
create table if not exists screens (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers(id) on delete cascade,
  member_id uuid not null references members(id),
  decision text not null check (decision in ('relevant', 'not_relevant', 'unsure')),
  reason text,
  updated_at timestamptz not null default now(),
  unique (paper_id, member_id)
);
create index if not exists screens_paper_idx on screens (paper_id);

-- Every database search that was run, with its counts: the PRISMA record.
create table if not exists searches (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  dbs jsonb,
  year_from int,
  year_to int,
  per_db int,
  run_by uuid references members(id),
  run_at timestamptz not null default now(),
  results jsonb,
  pulled int not null default 0,
  added int not null default 0
);
create index if not exists searches_time_idx on searches (run_at desc);

-- Small shared settings, such as the inclusion criteria the AI pre-screen checks against.
create table if not exists settings (
  key text primary key,
  value text,
  updated_by uuid references members(id),
  updated_at timestamptz not null default now()
);

alter table screens enable row level security;
alter table searches enable row level security;
alter table settings enable row level security;

-- Keywords the team plans to try (step 1). A keyword counts as done once a search with the
-- same text has been run; the match is computed by the app, nothing is stored here for it.
create table if not exists keyword_ideas (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  note text,
  added_by uuid references members(id),
  created_at timestamptz not null default now()
);
alter table keyword_ideas enable row level security;
