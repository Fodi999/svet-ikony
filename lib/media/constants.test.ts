import { describe, expect, it } from 'vitest';
import { mediaKindForPurpose } from './constants';

describe('mediaKindForPurpose', () => {
  it('audio (prayers) resolves to audio', () => {
    expect(mediaKindForPurpose('audio')).toBe('audio');
  });

  it('post-audio (Telegram Content Plan) resolves to audio, not image', () => {
    // Regression guard: this used to fall through to 'image' -- only the
    // literal purpose 'audio' was recognized as audio, and 'post-audio'
    // (added alongside 'post-image' for Content Plan manual attachments)
    // was missed. That misclassification made the upload route validate a
    // real MP3/M4A file against IMAGE_MIME_EXTENSIONS/MAX_IMAGE_BYTES
    // instead of the audio ones, rejecting it with 415.
    expect(mediaKindForPurpose('post-audio')).toBe('audio');
  });

  it('post-image (Telegram Content Plan) resolves to image', () => {
    expect(mediaKindForPurpose('post-image')).toBe('image');
  });

  it('an unknown purpose defaults to image (existing fallback behavior, unchanged)', () => {
    expect(mediaKindForPurpose('something-unrecognized')).toBe('image');
  });
});
