import { send, readSession, findTester, requireEnv } from '../../lib/central/core.js';
export default async function handler (req, res) {
  const missing = requireEnv(); if (missing) return send(res, 500, { error: 'config', missing });
  const s = readSession(req);
  if (!s) return send(res, 401, { error: 'login' });
  const t = await findTester(s.email);
  if (!t || t.active === false) return send(res, 401, { error: 'revoked' });
  return send(res, 200, { email: s.email, name: t.name || '' });
}
