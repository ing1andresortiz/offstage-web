// GET  /api/central/install?t=TOKEN        → the install script (bash for Mac, PowerShell for Windows)
// POST /api/central/install {product, os}  → { command } for the logged-in tester (token valid 30 min)
import { send, readJson, readSession, findTester, requireEnv } from '../../lib/central/core.js';
import { PRODUCTS } from '../../lib/central/products.js';
import { makeInstallToken, readInstallToken, installCommand, macScript, winScript } from '../../lib/central/installer.js';

const siteOf = (req) => process.env.SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host || 'weareoffstage.pro'}`;

export default async function handler (req, res) {
  const missing = requireEnv(); if (missing) return send(res, 500, { error: 'config', missing });
  const site = siteOf(req);

  if (req.method === 'POST') {
    const s = readSession(req);
    const t = s && await findTester(s.email);
    if (!t || t.active === false) return send(res, 401, { error: 'login' });
    const { product, os } = await readJson(req);
    const p = PRODUCTS.find(x => x.id === product);
    if (!p || !p.platforms[os]) return send(res, 404, { error: 'Producto o sistema no válido.' });
    const token = makeInstallToken(s.email, product, os);
    return send(res, 200, { command: installCommand(site, token, os), expiresInMinutes: 30 });
  }

  const url = new URL(req.url, 'http://x');
  const tok = readInstallToken(url.searchParams.get('t'));
  const textHeaders = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!tok) {
    res.writeHead(401, textHeaders);
    const msg = 'Este comando de instalación ha caducado o no es válido. Genera uno nuevo en ' + site + '/central';
    return res.end(url.searchParams.get('os') === 'win' ? `Write-Host '${msg}'` : `echo '${msg}'; exit 1`);
  }
  const t = await findTester(tok.email);
  if (!t || t.active === false) { res.writeHead(403, textHeaders); return res.end("echo 'Acceso revocado.'; exit 1"); }
  const token = url.searchParams.get('t');
  res.writeHead(200, textHeaders);
  return res.end(tok.os === 'win' ? winScript(site, token, tok.product) : macScript(site, token, tok.product));
}
