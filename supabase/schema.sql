-- CHHSR Meta Analysis Portal schema (version 3: one master list)
-- Fresh install: run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Existing install from an earlier version: run migrate_v3.sql instead.

create extension if not exists pgcrypto;

-- Team members (no passwords; the app gates on a cookie set at login).
-- is_pi marks who may approve or reject a paper over the votes.
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  initials text not null,
  is_pi boolean not null default false,
  created_at timestamptz not null default now()
);

-- One row per paper. pi_* hold the PI's decision when it overrides the votes.
create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  title text,
  authors text,
  first_author text,
  year int,
  journal text,
  doi text,
  abstract text,
  source text,
  pdf_path text,
  pages jsonb,
  pi_decision text check (pi_decision in ('include','exclude')),
  pi_note text,
  pi_by uuid references members(id),
  pi_at timestamptz,
  added_by uuid references members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists papers_doi_idx on papers (lower(doi)) where doi is not null;
create index if not exists papers_title_idx on papers (lower(title));

-- Votes: one per paper x member. A paper is approved when two people vote include and
-- nobody votes exclude, rejected when two vote exclude and nobody votes include;
-- anything else waits for the PI.
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers(id) on delete cascade,
  member_id uuid not null references members(id),
  decision text not null check (decision in ('include','exclude','unsure')),
  reason text,
  notes text,
  updated_at timestamptz not null default now(),
  unique (paper_id, member_id)
);

-- Study-feature coding: one shared row per paper that anyone can edit.
-- coder_id is who started it, updated_by who last saved it, done marks the paper finished.
-- evidence holds, per field, the sentence and page the value came from; ai_assisted marks AI-filled forms.
create table if not exists codings (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers(id) on delete cascade,
  coder_id uuid not null references members(id),
  updated_by uuid references members(id),
  done boolean not null default false,
  is_final boolean not null default false,
  study_design text,
  targeting_level text,
  cultural_adaptation text,
  adaptation_depth text,
  delivery_agent text,
  dosage_sessions numeric,
  dosage_weeks numeric,
  risk_of_bias text,
  setting text,
  age_min numeric,
  age_max numeric,
  n_total int,
  pct_black numeric,
  pct_latinx numeric,
  pct_low_income numeric,
  single_group_sample boolean,
  reporting_level text,
  measures_validated_by_group text,
  notes text,
  evidence jsonb,
  ai_assisted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, coder_id)
);

-- Extracted effects: one row per paper x outcome x group contrast x timepoint.
-- Prefixes: m_ = marginalized group, c_ = comparison group; _t_ = treatment arm, _c_ = control arm.
-- ai_assisted marks rows that Claude drafted and a person then checked and saved.
create table if not exists effects (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers(id) on delete cascade,
  entered_by uuid not null references members(id),
  updated_by uuid references members(id),
  verified_by uuid references members(id),
  ai_assisted boolean not null default false,
  outcome_family text not null check (outcome_family in ('engagement','mental_health','discipline')),
  outcome_name text,
  outcome_type text not null check (outcome_type in ('continuous','binary')),
  higher_is_worse boolean not null default false,
  timepoint text,
  group_dimension text not null check (group_dimension in ('black_white','latinx_white','income','other')),
  marginalized_group text,
  comparison_group text,
  tier text not null check (tier in ('cells','subgroup','interaction')),
  -- raw cells
  m_t_n numeric, m_t_mean numeric, m_t_sd numeric, m_t_events numeric,
  m_c_n numeric, m_c_mean numeric, m_c_sd numeric, m_c_events numeric,
  c_t_n numeric, c_t_mean numeric, c_t_sd numeric, c_t_events numeric,
  c_c_n numeric, c_c_mean numeric, c_c_sd numeric, c_c_events numeric,
  -- reported subgroup effects
  sg_d_m numeric, sg_se_m numeric, sg_d_c numeric, sg_se_c numeric,
  -- reported interaction term
  int_coef numeric, int_se numeric, int_scale text,
  -- computed (oriented so positive = gap narrowed)
  g_m numeric, var_m numeric, g_c numeric, var_c numeric,
  delta numeric, var_delta numeric,
  rd_delta numeric, var_rd_delta numeric,
  lnrr_delta numeric, var_lnrr_delta numeric,
  compute_note text,
  -- provenance
  page int,
  source_label text,
  quote text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists effects_paper_idx on effects (paper_id);

-- Change log: who did what to which paper, newest first on the paper page.
create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid references papers(id) on delete cascade,
  member_id uuid references members(id),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists activity_paper_idx on activity (paper_id, created_at desc);
create index if not exists activity_time_idx on activity (created_at desc);

-- Lock the tables down. The app uses the service role key on the server only,
-- which bypasses RLS. With RLS on and no policies, the anon key can read nothing.
alter table members enable row level security;
alter table papers enable row level security;
alter table votes enable row level security;
alter table codings enable row level security;
alter table effects enable row level security;
alter table activity enable row level security;

-- Private bucket for PDFs
insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

-- Seed the team (edit names as needed; more can be added from the login page)
insert into members (name, initials, is_pi) values
  ('Fan', 'FC', true),
  ('Kim', 'KS', false),
  ('Aaron', 'AV', false)
on conflict (name) do nothing;
