/** Stage 2D: the one shared shape every media endpoint (upload/get/delete)
 * and every consumer (admin BFF, future public-site rendering) agrees on.
 * Deliberately small — see AGENTS.md's "don't add fields without necessity". */
export type MediaKind = 'image' | 'audio';

export interface MediaObjectDto {
  /** R2 object key, including the leading `media/` segment — see lib/media/keys.ts. */
  key: string;
  /** Public URL this object is served from (GET /media/*). */
  url: string;
  contentType: string;
  size: number;
  etag?: string;
  kind: MediaKind;
}
