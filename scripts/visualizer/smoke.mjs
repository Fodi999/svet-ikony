/** Local-only API smoke test. Uses existing dev secret, never prints credentials.
 * Usage: node scripts/visualizer/smoke.mjs /path/to/BoxAnimated.glb
 * Official sample: KhronosGroup/glTF-Sample-Assets/Models/BoxAnimated/glTF-Binary
 * Creates named test records and removes them in finally. No historical seed data.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const origin = 'http://localhost:3000';
const vars = Object.fromEntries(fs.readFileSync('.dev.vars', 'utf8').split('\n').filter((line) => /^\w+=/.test(line)).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const secret = vars.ADMIN_JWT_SECRET || vars.JWT_SECRET;
assert(secret, 'Local dev secret required');
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'local-visualizer-smoke', role: 'super_admin', iat: now, exp: now + 600 })}`;
const token = `${unsigned}.${crypto.createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
const data = fs.readFileSync(process.argv[2]);
const events = new Set(); const models = new Set(); const keys = new Set();
async function api(path, method = 'GET', body, expected) {
  const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  if (expected) { assert.equal(response.status, expected, `${method} ${path}`); return response; }
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response.status === 204 ? null : response.json();
}
const eventPath = '/api/admin/church-content/visualizer-events';
const modelPath = '/api/admin/church-content/visualizer-models';
async function upload(entityId, filename = 'BoxAnimated.glb', bytes = data, mime = 'application/octet-stream', expected) {
  const form = new FormData(); form.set('file', new File([bytes], filename, { type: mime }));
  form.set('module', 'visualizer'); form.set('entityId', entityId); form.set('purpose', 'model');
  const result = await api('/api/admin/media/upload', 'POST', form, expected);
  if (!expected) keys.add(result.key);
  return result;
}
try {
  const existingBase = await api('/api/church/visualizer-models/base-earth');
  assert.equal(existingBase, null, 'Run in a local test database without a custom base model');
  const slug = `visualizer-smoke-${crypto.randomUUID()}`;
  const event = await api(eventPath, 'POST', { title: 'Тест GLB (тимчасовий)', slug, language: 'uk', status: 'draft', era: 'custom', chronologyType: 'unknown' }); events.add(event.id);
  await api(eventPath, 'POST', { title: 'Invalid coordinates', latitude: 91 }, 400);
  await upload(event.translationGroupId, 'wrong.txt', data, 'model/gltf-binary', 415);
  await upload(event.translationGroupId, 'bad.glb', Buffer.from('not GLB'), 'model/gltf-binary', 400);
  const first = await upload(event.translationGroupId);
  assert.equal(first.contentType, 'model/gltf-binary');
  const model = await api(modelPath, 'POST', { eventGroupId: event.translationGroupId, r2Key: first.key, filename: 'spoofed', fileSize: 1 }); models.add(model.id);
  assert.equal(model.filename, 'BoxAnimated.glb'); assert.equal(model.fileSize, data.length); assert.equal(model.mimeType, 'model/gltf-binary');
  const delivered = await fetch(`${origin}/${first.key}`);
  assert.equal(delivered.status, 200); assert.equal(delivered.headers.get('content-type'), 'model/gltf-binary');
  assert.match(delivered.headers.get('cache-control'), /immutable/);
  const gltf = await new GLTFLoader().parseAsync(await delivered.arrayBuffer(), '');
  assert(gltf.scene.children.length > 0); assert(gltf.animations.length > 0);
  const draftList = await api('/api/church/visualizer-events?language=uk'); assert(!draftList.some((item) => item.id === event.id));
  await api(`${eventPath}/${event.id}`, 'PUT', { status: 'published' });
  const detail = await api(`/api/church/visualizer-events/${slug}?language=uk`); assert.equal(detail.models[0].id, model.id);
  const rendered = await (await fetch(origin + '/uk/pravoslavna-istoriya')).text(); assert(rendered.includes(event.title), 'Published event must reach the rendered page');
  const ru = await api(eventPath, 'POST', { title: 'Тест перевода (временный)', slug, language: 'ru', status: 'draft' }); events.add(ru.id);
  assert.equal(ru.translationGroupId, event.translationGroupId);
  const shared = await api(modelPath, 'POST', { eventGroupId: event.translationGroupId, r2Key: first.key }); models.add(shared.id);
  await api(`${modelPath}/${shared.id}/set-base-earth`, 'POST');
  await api('/api/admin/media', 'DELETE', { key: first.key }, 409);
  const replacement = await upload(event.translationGroupId, 'BoxAnimated-v2.glb');
  await api(`${modelPath}/${model.id}`, 'PUT', { r2Key: replacement.key });
  assert.equal((await fetch(`${origin}/${first.key}`)).status, 200, 'shared file survived replacement');
  await api(`${eventPath}/${event.id}`, 'DELETE'); events.delete(event.id);
  assert.equal((await fetch(`${origin}/${replacement.key}`)).status, 200, 'remaining translation retained model');
  await api(`${eventPath}/${ru.id}`, 'DELETE'); events.delete(ru.id); models.delete(model.id);
  assert.equal((await fetch(`${origin}/${replacement.key}`)).status, 404, 'unreferenced event file removed'); keys.delete(replacement.key);
  const base = await api('/api/church/visualizer-models/base-earth'); assert.equal(base.id, shared.id); assert.equal(base.eventGroupId, null);
  assert.equal((await fetch(`${origin}/${first.key}`)).status, 200, 'base survived event deletion');
  await api(`${modelPath}/${shared.id}?force=1`, 'DELETE'); models.delete(shared.id);
  assert.equal((await fetch(`${origin}/${first.key}`)).status, 404); keys.delete(first.key);
  const page = await fetch(origin + '/uk/pravoslavna-istoriya'); assert.equal(page.status, 200);
  console.log('PASS: GLB upload/validation, real R2 delivery, D1 metadata, animation parse, draft/publish, translation sharing, replacement, base protection and deletion.');
} finally {
  for (const id of events) try { await api(`${eventPath}/${id}`, 'DELETE'); } catch { /* already gone */ }
  for (const id of models) try { await api(`${modelPath}/${id}?force=1`, 'DELETE'); } catch { /* already gone */ }
  for (const key of keys) try { await api('/api/admin/media', 'DELETE', { key }); } catch { /* reference guard preserves shared files */ }
}
