import { send, readJson, requireEnv, findTester, normEmail, safeEqual, makeSessionCookie, updateData } from '../../lib/central/core.js';

export default async function handler (req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const missing = requireEnv(); if (missing) return send(res, 500, { error: 'config', missing });
  const { email, code } = await readJson(req);
  const t = email && code ? await findTester(email) : null;
  const ok = t && t.active !== false && safeEqual(String(t.code).toUpperCase(), String(code).trim().toUpperCase());
  if (!ok) {
    await new Promise(r => setTimeout(r, 600));          // slow down guessing
    return send(res, 401, { error: 'Email o código de invitación incorrectos.' });
  }
  try {
    await updateData('testers', list => list.map(x => normEmail(x.email) === normEmail(email)
      ? { ...x, lastLogin: new Date().toISOString() } : x), `data: login ${normEmail(email)}`);
  } catch { /* login still succeeds if the timestamp can't be written */ }
  return send(res, 200, { email: normEmail(email), name: t.name || '' }, { 'Set-Cookie': makeSessionCookie(normEmail(email)) });
}
