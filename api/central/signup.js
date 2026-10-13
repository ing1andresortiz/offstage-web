// Altas desde la web: "Solicitar acceso" en weareoffstage.pro (#tourdesk). Mismo sistema que el resto de productos:
// el tester queda dado de alta en la central y le llega su código por email.
// POST /api/central/signup {email, product, t, hp}
//   granted  → había cupo: alta automática y email con su código
//   waitlist → cupo lleno (o TourDesk aún sin conectar): queda en espera; Andrés lo aprueba en /central/admin.html
//   exists   → ya tenía acceso (le reenviamos su código si el último email tiene más de 1 h)
//   pending  → ya estaba en espera
import { send, readJson, requireEnv, readData, updateData, normEmail, newCode, canUse, readSettings, signupCap, signupStats } from '../../lib/central/core.js';
import { PRODUCTS } from '../../lib/central/products.js';
import { sendInvite, notifyOwner } from '../../lib/central/mail.js';
import { firebaseReady } from '../../lib/central/firebase.js';

const siteOf = (req) => process.env.SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host || 'weareoffstage.pro'}`;
const EMAIL = /^[^@\s"'<>,;]+@[^@\s"'<>,;]+\.[a-z]{2,}$/i;
const MAX_PENDING = 1000;                 // tope de la lista de espera (protege data/testers.json de basura)
const hits = new Map();                   // por instancia: frena ráfagas desde una misma IP
function tooMany (ip) {
  const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  a.push(now); hits.set(ip, a);
  if (hits.size > 5000) hits.clear();
  return a.length > 8;
}

// Decide qué hacer con este email según la lista actual (se recalcula dentro de updateData por si hubo cambios)
function plan (list, email, p, ready, cap) {
  const i = list.findIndex(t => normEmail(t.email) === email);
  const t = i >= 0 ? list[i] : null;
  const stats = signupStats(list, p.id);
  const room = ready && stats.used < cap;
  const now = new Date().toISOString();
  if (t && t.active === false) return { outcome: t.pending ? 'pending' : 'revoked', stats };
  if (t && canUse(t, p.id)) return { outcome: 'exists', tester: t, stats };
  if (t && Array.isArray(t.wants) && t.wants.includes(p.id)) return { outcome: 'pending', stats };
  if (t) {                                   // tester de otro producto que ahora pide este
    const signup = { ...(t.signup || {}), [p.id]: now };
    const next = room ? { ...t, products: [...new Set([...(t.products || []), p.id])], signup }
                      : { ...t, wants: [...new Set([...(t.wants || []), p.id])], signup };
    return { outcome: room ? 'granted' : 'waitlist', stats, tester: next, list: list.map((x, k) => k === i ? next : x) };
  }
  if (!room && list.filter(x => x.pending).length >= MAX_PENDING) return { outcome: 'waitlist', stats };
  const created = room
    ? { email, name: '', code: newCode(), active: true, created: now, products: [p.id], source: 'web', signup: { [p.id]: now } }
    : { email, name: '', code: newCode(), active: false, pending: true, created: now, products: [], wants: [p.id], source: 'web', signup: { [p.id]: now } };
  return { outcome: room ? 'granted' : 'waitlist', stats, tester: created, list: [...list, created] };
}

async function markEmailed (email) {
  try {
    await updateData('testers', list => list.map(t => normEmail(t.email) === email ? { ...t, emailedAt: new Date().toISOString() } : t), `data: emailed ${email}`);
  } catch { /* el email salió aunque no se guarde la fecha */ }
}

export default async function handler (req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (requireEnv()) return send(res, 503, { error: 'config' });
  try { return await signup(req, res); }
  catch (e) { console.error(e); return send(res, 502, { error: 'No se pudo registrar ahora mismo.' }); }
}

async function signup (req, res) {
  const body = await readJson(req);
  const email = normEmail(body.email);
  const p = PRODUCTS.find(x => x.id === String(body.product || 'tourdesk') && x.signup);
  if (!p) return send(res, 400, { error: 'Producto no válido.' });
  if (!EMAIL.test(email) || email.length > 120) return send(res, 400, { error: 'Email no válido.' });
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
  // bots: campo trampa relleno, envío instantáneo o ráfaga desde la misma IP → "en espera" sin guardar nada
  if (body.hp || !(Number(body.t) >= 1500) || tooMany(ip)) return send(res, 200, { status: 'waitlist' });

  const ready = !p.web || firebaseReady();          // TourDesk solo da acceso al momento si ya está conectado a Firebase
  const [settings, { data }] = await Promise.all([readSettings(), readData('testers')]);
  const cap = signupCap(settings, p.id);
  let d = plan(data, email, p, ready, cap);
  if (d.list) {
    const first = d.outcome;
    await updateData('testers', list => { d = plan(list, email, p, ready, cap); return d.list || list; }, `data: signup ${first} ${email}`);
  }
  const site = siteOf(req);

  if (d.outcome === 'granted') {
    const mail = await sendInvite(d.tester, site);
    await Promise.all([
      mail.sent ? markEmailed(email) : null,
      notifyOwner(`${p.name}: nueva alta desde la web (${d.stats.used + 1}/${cap})`, [
        `${email} se apuntó en la web y ya tiene acceso a ${p.name}.`,
        mail.sent ? 'Le llegó su código por email.' : `Ojo: el email no salió (${mail.error}). Reenvíaselo desde el admin.`
      ], site)
    ]);
    return send(res, 200, { status: 'granted', mailed: !!mail.sent });
  }
  if (d.outcome === 'waitlist') {
    if (d.tester) {
      await notifyOwner(`${p.name}: nueva solicitud en espera`, [
        `${email} se apuntó en la web.`,
        ready ? `El cupo está lleno (${d.stats.used}/${cap}): apruébalo en el admin o sube el cupo.`
              : `${p.name} aún no está conectado (falta FIREBASE_SERVICE_ACCOUNT en Vercel). Cuando lo esté, apruébalo en el admin.`
      ], site);
    }
    return send(res, 200, { status: 'waitlist' });
  }
  if (d.outcome === 'exists') {
    const last = Date.parse(d.tester.emailedAt || '') || 0;
    if (Date.now() - last > 3600e3) {
      const mail = await sendInvite(d.tester, site);
      if (mail.sent) await markEmailed(email);
    }
    return send(res, 200, { status: 'exists' });
  }
  return send(res, 200, { status: 'pending' });     // también para revocados: no decimos nada más
}
