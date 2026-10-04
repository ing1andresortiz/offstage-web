import { send, readSession, findTester, getCatalog, requireEnv } from '../../lib/central/core.js';
export default async function handler (req, res) {
  const missing = requireEnv(); if (missing) return send(res, 500, { error: 'config', missing });
  const s = readSession(req);
  const t = s && await findTester(s.email);
  if (!t || t.active === false) return send(res, 401, { error: 'login' });
  try { return send(res, 200, { products: await getCatalog() }); }
  catch (e) { return send(res, 502, { error: 'No se pudo leer el catálogo desde GitHub.', detail: String(e.message || e) }); }
}
