-- AI milestone D (AIS-09): listing drafts (AI-04), report commentary (AI-07) and grounded help
-- (AI-11) share the AI usage caps and accounting with search.
--
-- Rollback: restore the original check constraint from 20261022000001_ai_search.sql.

alter table public.ai_usage_daily drop constraint ai_usage_daily_feature_check;
alter table public.ai_usage_daily add constraint ai_usage_daily_feature_check
  check (feature in ('search_intent', 'transcribe', 'listing_draft', 'report_commentary', 'help_answer'));
