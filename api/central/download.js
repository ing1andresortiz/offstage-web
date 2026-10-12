import { send, readSession, findTester, artifactRedirect, updateData, requireEnv } from '../../lib/central/core.js';
import { readInstallToken } from '../../lib/central/installer.js';

export default async function handler (req, res) {
  const missing = requireEnv(); if (missing) return send(res, 500, { error: 'config', missing });
  const url = new URL(req.url, 'http://x');
  const product = url.searchParams.get('product'), os = url.searchParams.get('os');
  // two ways in: the browser session cookie, or a short-lived token from the one-line installer
  const tok = url.searchParams.get('t') ? readInstallToken(url.searchParams.get('t')) : null;
  if (url.searchParams.get('t') && (!tok || tok.product !== product || tok.os !== os)) return send(res, 401, { error: 'Enlace de instalación caducado o no válido.' });
  const s = tok ? { email: tok.email } : readSession(req);
  const t = s && await findTester(s.email);
  if (!t || t.active === false) {
    if (tok) return send(res, 403, { error: 'Acceso revocado.' });
    res.statusCode = 302; res.setHeader('Location', '/central/?login=1'); return res.end();
  }
  const r = await artifactRedirect(product, os);
  if (r.error) return send(res, r.status || 500, { error: r.error });
  try {
    await updateData('downloads', list => [...list, {
      ts: new Date().toISOString(), email: s.email, product, os,
      version: r.version, build: r.artifact.id, size: r.artifact.size_in_bytes, via: tok ? 'installer' : 'web'
    }].slice(-5000), `data: download ${product}/${os} by ${s.email}`);
  } catch { /* never block a download because the log failed */ }
  res.statusCode = 302;
  res.setHeader('Location', r.location);
  res.setHeader('Cache-Control', 'no-store');
  return res.end();
}
