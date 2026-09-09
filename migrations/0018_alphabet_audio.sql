-- Adds audio_url to church_alphabet_letters (per-letter narration audio,
-- one file per language row, narrating that row's full_text/"Історична
-- довідка"). A plain constant default -- unlike migration 0017's
-- translation_group_id, this needs no per-row unique value, so the
-- ADD COLUMN ... DEFAULT '' form is safe even against a non-empty table
-- (SQLite/D1 only rejects a non-constant DEFAULT expression on ADD COLUMN;
-- a literal empty string is constant).

ALTER TABLE church_alphabet_letters ADD COLUMN audio_url TEXT NOT NULL DEFAULT '';
