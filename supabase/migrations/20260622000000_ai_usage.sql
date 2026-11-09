-- AI usage telemetry: one row per model call, written by the Edge Functions
-- (service role) through the callVision/callText seam in _shared/vision.ts.
--
-- Why this exists: the roadmap cost section (§5) needs a *measured* $/transfer
-- instead of an order-of-magnitude estimate. This table is the source. The
-- placeholders in §5.1 (avg calls/transfer, avg in/out tokens, $/transfer) are
-- filled by the aggregation query at the bottom of this file over ~30–40 real
-- pilot transfers.
--
-- Forward-looking columns: transfer_id and user_id are nullable and unused in the
-- single-driver pilot. user_id becomes the key for the per-user extraction quota
-- in the phase-1 auth plan (§3.2 layer 4) — the same table that measures cost will
-- later enforce it, so no second telemetry path is needed.
--
-- Cost is intentionally NOT stored. Token prices change (and the EU endpoint adds
-- +10% per §5.1), so the table stays raw tokens and price lives in the query —
-- a price change must not require a migration or a backfill.

CREATE TABLE IF NOT EXISTS ai_usage (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at        timestamptz NOT NULL DEFAULT now(),
  function_name     text        NOT NULL,            -- 'extract_odometer' | 'extract_plate' | 'extract_receipt' | 'extract_travel_doc'
  model             text        NOT NULL,            -- pinned snapshot id, e.g. gpt-5.4-mini-2026-03-17
  prompt_tokens     integer     NOT NULL DEFAULT 0,  -- usage.prompt_tokens (image + prompt dominate this on vision calls)
  completion_tokens integer     NOT NULL DEFAULT 0,  -- usage.completion_tokens (short JSON, small)
  total_tokens      integer     NOT NULL DEFAULT 0,  -- usage.total_tokens
  cached_tokens     integer     NOT NULL DEFAULT 0,  -- usage.prompt_tokens_details.cached_tokens (billed at -90%)
  duration_ms       integer,                         -- wall-clock of the model call, for latency context
  transfer_id       uuid,                            -- best-effort; null until threaded through (extraction runs before submit)
  user_id           uuid,                            -- null in v1 single-driver; phase-1 quota key
  ok                boolean     NOT NULL DEFAULT true
);

-- Time-window aggregation (cost over the last N days / pilot period) is the main
-- read pattern; function_name breakdown is the secondary one.
CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx ON ai_usage (created_at);
CREATE INDEX IF NOT EXISTS ai_usage_function_idx   ON ai_usage (function_name);

-- Lock down, same posture as submit_transfer: only the service-role Edge Function
-- writes/reads. RLS on with no policies denies anon/authenticated; service_role
-- bypasses RLS. Revoke the default PUBLIC grants so PostgREST cannot touch it with
-- the anon key.
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_usage FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON ai_usage TO service_role;

-- ---------------------------------------------------------------------------
-- Aggregation query for roadmap §5.1 — run after ~30–40 pilot transfers.
-- Prices are gpt-5.4-mini (USD / 1M tokens, OpenAI June 2026): input $0.75,
-- output $4.50, cached input $0.075. Cached tokens are a -90% subset of prompt
-- tokens, so non-cached input = prompt_tokens - cached_tokens.
-- For the EU endpoint, multiply the input/output rates by 1.10 (§5.1 note).
--
--   WITH window_usage AS (
--     SELECT * FROM ai_usage
--     WHERE created_at >= now() - interval '30 days' AND ok
--   ),
--   submitted AS (
--     SELECT count(*) AS n
--     FROM transfers
--     WHERE status = 'submitted' AND deleted_at IS NULL
--       AND updated_at >= now() - interval '30 days'
--   )
--   SELECT
--     (SELECT n FROM submitted)                                            AS transfers,
--     count(*)                                                             AS ai_calls,
--     round(count(*)::numeric        / NULLIF((SELECT n FROM submitted),0), 2) AS avg_calls_per_transfer,
--     round(sum(prompt_tokens)::numeric     / NULLIF((SELECT n FROM submitted),0)) AS avg_input_tokens_per_transfer,
--     round(sum(completion_tokens)::numeric / NULLIF((SELECT n FROM submitted),0)) AS avg_output_tokens_per_transfer,
--     round((
--       (sum(prompt_tokens - cached_tokens) * 0.75
--        + sum(cached_tokens)               * 0.075
--        + sum(completion_tokens)           * 4.50) / 1e6
--     ) / NULLIF((SELECT n FROM submitted),0), 4)                          AS usd_per_transfer
--   FROM window_usage;
-- ---------------------------------------------------------------------------
