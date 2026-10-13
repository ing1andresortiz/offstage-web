// TourDesk desde OffStage Central (entrar sin contraseña, con la invitación de la central)
// GET  /api/central/tourdesk               → botón "Abrir TourDesk" del portal: entra directo con la sesión de la central
// POST /api/central/tourdesk {email, code} → la propia app TourDesk (p. ej. instalada en el móvil) entra con email + código
// En los dos casos se devuelve un token de Firebase que caduca en 15 minutos (ver lib/central/firebase.js).
import { send, readJson, readSession, findTester, normEmail, safeEqual, requireEnv, readData, updateData, canUse } from '../../lib/central/core.js';
import { customToken, tourdeskUid } from '../../lib/central/firebase.js';

const APP_URL = () => String(process.env.TOURDESK_URL || 'https://tourdesk-pro.vercel.app/').trim().replace(/#.*$/, '');
const ORIGINS = () => String(process.env.TOURDESK_ORIGINS || 'https://tourdesk-pro.vercel.app')
  .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);

function cors (req, res) {
  const o = String(req.headers.origin || '');
  if (!o || !ORIGINS().includes(o)) return;
  res.setHeader('Access-Control-Allow-Origin', o);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

const backToPortal = (res, why) => {
  res.statusCode = 302;
  res.setHeader('Location', `/central/?td=${why}`);
  res.setHeader('Cache-Control', 'no-store');
  return res.end();
};

const tokenFor = (t, email) => customToken(tourdeskUid(email), {
  src: 'central', tname: String(t.name || '').slice(0, 80), tmail: normEmail(email)
});

// Anota la entrada en el log de descargas (como mucho una cada 30 min por tester) para verla en /central/admin.html
async function logOpen (email, via) {
  try {
    const { data } = await readData('downloads');
    const last = [...data].reverse().find(d => d.email === email && d.product === 'tourdesk');
    if (last && Date.now() - Date.parse(last.ts) < 30 * 60e3) return;
    await updateData('downloads', list => [...list, { ts: new Date().toISOString(), email, product: 'tourdesk', os: 'web', via }].slice(-5000),
      `data: tourdesk ${via} by ${email}`);
  } catch { /* nunca bloquear la entrada porque falle el log */ }
}

export default async function handler (req, res) {
  if (req.method === 'OPTIONS') { cors(req, res); res.statusCode = 204; return res.end(); }
  const missing = requireEnv();
  if (req.method === 'POST') {
    cors(req, res);
    if (missing) return send(res, 500, { error: 'El acceso a la beta no está disponible ahora mismo. Avisa a OffStage.' });
    try { return await appLogin(req, res); } catch (e) { console.error(e); return send(res, 502, { error: 'No se pudo entrar ahora mismo. Inténtalo en un momento.' }); }
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  if (missing) return send(res, 500, { error: 'config', missing });
  return portalOpen(req, res);
}

async function portalOpen (req, res) {
  const s = readSession(req);
  let t = null;
  try { t = s && await findTester(s.email); } catch (e) { console.error(e); return backToPortal(res, 'error'); }
  if (!t || t.active === false) return backToPortal(res, 'login');
  if (!canUse(t, 'tourdesk')) return backToPortal(res, 'noaccess');
  let token;
  try { token = tokenFor(t, s.email); } catch (e) { console.error(e); return backToPortal(res, e.code === 'config' ? 'config' : 'error'); }
  await logOpen(normEmail(s.email), 'portal');
  res.statusCode = 302;
  res.setHeader('Location', `${APP_URL()}#ct=${token}`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return res.end();
}

async function appLogin (req, res) {
  const { email, code } = await readJson(req);
  let t = null;
  try { t = email && code ? await findTester(email) : null; }
  catch (e) { console.error(e); return send(res, 502, { error: 'No se pudo comprobar tu invitación ahora mismo. Inténtalo en un momento.' }); }
  const ok = t && t.active !== false && safeEqual(String(t.code).toUpperCase(), String(code).trim().toUpperCase());
  if (!ok) {
    await new Promise(r => setTimeout(r, 600));          // frena a quien intente adivinar códigos
    return send(res, 401, { error: 'Email o código de invitación incorrectos.' });
  }
  if (!canUse(t, 'tourdesk')) return send(res, 403, { error: 'Tu invitación no incluye TourDesk. Pídele acceso a OffStage.' });
  let token;
  try { token = tokenFor(t, email); }
  catch (e) { console.error(e); return send(res, 503, { error: 'TourDesk se está terminando de conectar. Inténtalo en un rato.' }); }
  const who = normEmail(email);
  await Promise.all([
    updateData('testers', list => list.map(x => normEmail(x.email) === who ? { ...x, lastLogin: new Date().toISOString() } : x),
      `data: login tourdesk ${who}`).catch(() => {}),
    logOpen(who, 'app')
  ]);
  return send(res, 200, { token, name: t.name || '' });
}
