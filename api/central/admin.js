import { send, readJson, requireEnv, safeEqual, readData, updateData, normEmail, newCode, getCatalog, readSettings, signupCap, signupStats } from '../../lib/central/core.js';
import { sendInvite } from '../../lib/central/mail.js';
import { PRODUCTS } from '../../lib/central/products.js';
import { firebaseReady } from '../../lib/central/firebase.js';

const siteOf = (req) => process.env.SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host || 'weareoffstage.pro'}`;
// lista de productos a los que da acceso una invitación (null = no se indicó → acceso a todo, como antes)
const cleanProducts = (v) => Array.isArray(v) ? PRODUCTS.map(p => p.id).filter(id => v.includes(id)) : null;
// aprobar a alguien en espera: activo + lo que pidió pasa a sus productos
const approved = (t) => {
  const { pending, wants, ...rest } = t;
  return { ...rest, active: true, products: [...new Set([...(Array.isArray(t.products) ? t.products : []), ...(Array.isArray(wants) ? wants : [])])] };
};
const waiting = (t) => t.pending || (Array.isArray(t.wants) && t.wants.length > 0);

export default async function handler (req, res) {
  try { return await main(req, res); } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
}

async function main (req, res) {
  const missing = requireEnv(); if (missing) return send(res, 500, { error: 'config', missing });
  if (!safeEqual(String(req.headers['x-admin-password'] || '').trim(), String(process.env.ADMIN_PASSWORD || '').trim())) {
    await new Promise(r => setTimeout(r, 600));
    return send(res, 401, { error: 'Contraseña de admin incorrecta.' });
  }
  const url = new URL(req.url, 'http://x');
  const action = url.searchParams.get('action') || 'state';

  if (req.method === 'GET' && action === 'state') {
    const [testers, downloads, settings] = await Promise.all([readData('testers'), readData('downloads'), readSettings()]);
    let products = [];
    try { products = await getCatalog(); } catch (e) { products = [{ error: String(e.message || e) }]; }
    const signup = PRODUCTS.filter(p => p.signup).map(p => ({ id: p.id, name: p.name, cap: signupCap(settings, p.id), ready: !p.web || firebaseReady(), ...signupStats(testers.data, p.id) }));
    return send(res, 200, { testers: testers.data, downloads: downloads.data.slice(-300).reverse(), products, signup });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const email = normEmail(body.email);
    if (action === 'add') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Email no válido.' });
      const products = cleanProducts(body.products);
      if (products && !products.length) return send(res, 400, { error: 'Elige al menos un producto.' });
      let created = null;
      await updateData('testers', list => {
        if (list.some(t => normEmail(t.email) === email)) return list;
        created = { email, name: String(body.name || '').slice(0, 80), code: newCode(), active: true, created: new Date().toISOString(), ...(products ? { products } : {}) };
        return [...list, created];
      }, `data: invite ${email}`);
      if (!created) return send(res, 409, { error: 'Ese email ya está invitado.' });
      const mail = body.sendEmail === false ? { sent: false, skipped: true } : await sendInvite(created, siteOf(req));
      if (mail.sent) await markEmailed(email);
      return send(res, 200, { tester: created, mail });
    }
    if (action === 'toggle' || action === 'regen' || action === 'remove') {
      let found = false, updated = null;
      await updateData('testers', list => {
        const out = [];
        for (const t of list) {
          if (normEmail(t.email) !== email) { out.push(t); continue; }
          found = true;
          if (action === 'remove') continue;
          updated = action === 'toggle' ? (t.active === false && t.pending ? approved(t) : { ...t, active: t.active === false }) : { ...t, code: newCode() };
          out.push(updated);
        }
        return out;
      }, `data: ${action} ${email}`);
      if (!found) return send(res, 404, { error: 'No existe ese tester.' });
      let mail;
      if (action === 'regen' && body.sendEmail !== false) { mail = await sendInvite(updated, siteOf(req)); if (mail.sent) await markEmailed(email); }
      return send(res, 200, { tester: updated, removed: action === 'remove', mail });
    }
    if (action === 'access') {
      const products = cleanProducts(body.products);
      if (!products || !products.length) return send(res, 400, { error: 'Deja al menos un producto (para quitarle todo, usa Revocar).' });
      let updated = null;
      await updateData('testers', list => list.map(t => normEmail(t.email) === email ? (updated = { ...t, products }) : t), `data: access ${email} ${products.join(',')}`);
      if (!updated) return send(res, 404, { error: 'No existe ese tester.' });
      return send(res, 200, { tester: updated });
    }
    if (action === 'cap') {                      // cupo de altas automáticas desde la web
      const p = PRODUCTS.find(x => x.id === body.product && x.signup);
      const cap = Math.floor(Number(body.cap));
      if (!p || !Number.isFinite(cap) || cap < 0 || cap > 100000) return send(res, 400, { error: 'Cupo no válido.' });
      await updateData('settings', s => {
        const o = s && !Array.isArray(s) && typeof s === 'object' ? s : {};
        return { ...o, signupCap: { ...(o.signupCap || {}), [p.id]: cap } };
      }, `data: cupo ${p.id} ${cap}`);
      return send(res, 200, { product: p.id, cap });
    }
    if (action === 'approve' || action === 'approveAll') {     // dar acceso a quien está en espera (+ email con su código)
      const max = action === 'approve' ? 1 : Math.min(10, Math.max(1, Number(body.limit) || 10));
      const picked = [];
      await updateData('testers', list => {
        picked.length = 0;
        return list.map(t => {
          const match = action === 'approve' ? normEmail(t.email) === email
            : picked.length < max && waiting(t) && (!body.product || (Array.isArray(t.wants) && t.wants.includes(body.product)));
          if (!match || !waiting(t) || picked.length >= max) return t;
          const u = approved(t); picked.push(u); return u;
        });
      }, action === 'approve' ? `data: approve ${email}` : `data: approve ${max} pending`);
      if (action === 'approve' && !picked.length) return send(res, 404, { error: 'Ese tester no está en espera.' });
      const site = siteOf(req), results = [];
      for (const t of picked) {
        const mail = await sendInvite(t, site);
        results.push({ email: t.email, sent: !!mail.sent, error: mail.error });
      }
      const sent = results.filter(r => r.sent).map(r => r.email);
      if (sent.length) {
        try { await updateData('testers', list => list.map(t => sent.includes(t.email) ? { ...t, emailedAt: new Date().toISOString() } : t), `data: emailed ${sent.length}`); } catch {}
      }
      return send(res, 200, { approved: picked.length, results, mail: action === 'approve' ? (results[0].sent ? { sent: true } : { sent: false, error: results[0].error }) : undefined });
    }
    if (action === 'send') {
      const { data } = await readData('testers');
      const t = data.find(x => normEmail(x.email) === email);
      if (!t) return send(res, 404, { error: 'No existe ese tester.' });
      if (t.active === false) return send(res, 400, { error: 'Ese tester está revocado: reactívalo antes de enviarle la invitación.' });
      const mail = await sendInvite(t, siteOf(req));
      if (mail.sent) await markEmailed(email);
      return send(res, mail.sent ? 200 : 502, { tester: t, mail, error: mail.sent ? undefined : mail.error });
    }
  }
  return send(res, 400, { error: 'acción no válida' });
}

async function markEmailed (email) {
  try {
    await updateData('testers', list => list.map(t => normEmail(t.email) === email ? { ...t, emailedAt: new Date().toISOString() } : t), `data: emailed ${email}`);
  } catch { /* the email went out even if the timestamp can't be stored */ }
}
