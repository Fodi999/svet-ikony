-- Additive only: adds manual audio attachment support to telegram_posts,
-- parallel to media_url (photo). audio_url is never auto-generated (no
-- TTS in this task) -- it's set exclusively via the admin "Обрати з
-- медіатеки" / upload flow, mirroring assignSlotImage's own media_url
-- write path exactly, just with no generate/regenerate counterpart. No
-- audio_error column: unlike image generation (async, runs inside the
-- autopost tick, needs a persisted failure reason independent of
-- error_message), assignment is a synchronous admin action -- a failure
-- there is a rejected request, not a row that needs to remember why.
--
-- telegram_audio_message_id follows telegram_photo_message_id's (0011)
-- established pattern: Telegram has no single message type that carries
-- both a photo and an audio file, so a photo+audio+text plan is
-- necessarily >=2 messages. This column records the audio message's id
-- once sent, independent from telegram_photo_message_id, so a retry can
-- tell exactly which of (photo, audio, text) already went out and skip
-- re-sending the parts that succeeded. NULL whenever no audio was part of
-- the plan, or nothing has been sent yet.
ALTER TABLE telegram_posts ADD COLUMN audio_url TEXT;
ALTER TABLE telegram_posts ADD COLUMN telegram_audio_message_id INTEGER;
