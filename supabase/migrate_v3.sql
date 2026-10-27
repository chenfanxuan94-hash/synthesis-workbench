-- CHHSR Meta Analysis Portal: update an existing database to version 3 (one master list).
-- Safe to run more than once. Nothing is deleted; earlier screening decisions are carried over as votes.
-- Run in Supabase: SQL Editor -> New query -> paste all of this -> Run.

-- 1. Who is the PI (may approve or reject a paper over the votes)
alter table members add column if not exists is_pi boolean not null default false;
update members set is_pi = true where lower(name) = 'fan';

-- 2. Votes: one per paper x member
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
alter table votes enable row level security;

-- Carry over earlier screening decisions (each person's latest decision on each paper)
do $$
begin
  if to_regclass('public.screenings') is not null then
    insert into votes (paper_id, member_id, decision, reason, notes, updated_at)
    select distinct on (paper_id, member_id) paper_id, member_id, decision, reason, notes, updated_at
    from screenings
    order by paper_id, member_id, updated_at desc
    on conflict (paper_id, member_id) do nothing;
  end if;
end $$;

-- 3. PI decision on a paper
alter table papers add column if not exists pi_decision text;
alter table papers add column if not exists pi_note text;
alter table papers add column if not exists pi_by uuid references members(id);
alter table papers add column if not exists pi_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'papers_pi_decision_check') then
    alter table papers add constraint papers_pi_decision_check check (pi_decision in ('include','exclude'));
  end if;
end $$;

-- Carry over decisions recorded at the old disagreement step
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'papers' and column_name = 'fulltext_override') then
    update papers
       set pi_decision = case when fulltext_override is not null then fulltext_override
                              when abstract_override = 'exclude' then 'exclude' end,
           pi_note = override_reason,
           pi_by = override_by,
           pi_at = updated_at
     where pi_decision is null
       and (fulltext_override is not null or abstract_override = 'exclude');
  end if;
end $$;

-- 4. Shared coding: who last saved it, and whether the paper is done
alter table codings add column if not exists updated_by uuid references members(id);
alter table codings add column if not exists done boolean not null default false;

-- 5. Effect rows: who last edited, and whether Claude drafted it
alter table effects add column if not exists updated_by uuid references members(id);
alter table effects add column if not exists ai_assisted boolean not null default false;

-- 6. Change log
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
alter table activity enable row level security;

-- Done. The old screenings table is left in place; the app no longer reads it.
