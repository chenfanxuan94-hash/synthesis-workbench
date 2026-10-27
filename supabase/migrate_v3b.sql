-- CHHSR Meta Analysis Portal: small update after version 3 (AI fill for the study-features form).
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

-- Per field, the sentence and page the value came from (shown on hover in the form)
alter table codings add column if not exists evidence jsonb;

-- Marks forms that the AI filled and a person checked
alter table codings add column if not exists ai_assisted boolean not null default false;
