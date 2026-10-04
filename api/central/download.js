import { send, readSession, findTester, artifactRedirect, updateData, requireEnv } from '../../lib/central/core.js';

export default async function handler (req, res) {
  const missing = requireEnv(); if (missing) return send(res, 500, { error: 'config', missing });
  const s = readSession(req);
  const t = s && await findTester(s.email);
  if (!t || t.active === false) { res.statusCode = 302; res.setHeader('Location', '/central/?login=1'); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const product = url.searchParams.get('product'), os = url.searchParams.get('os');
  const r = await artifactRedirect(product, os);
  if (r.error) return send(res, r.status || 500, { error: r.error });
  try {
    await updateData('downloads', list => [...list, {
      ts: new Date().toISOString(), email: s.email, product, os,
      version: r.version, build: r.artifact.id, size: r.artifact.size_in_bytes
    }].slice(-5000), `data: download ${product}/${os} by ${s.email}`);
  } catch { /* never block a download because the log failed */ }
  res.statusCode = 302;
  res.setHeader('Location', r.location);
  res.setHeader('Cache-Control', 'no-store');
  return res.end();
}
