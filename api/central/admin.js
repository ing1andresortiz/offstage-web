import { send, readJson, requireEnv, safeEqual, readData, updateData, normEmail, newCode, getCatalog } from '../../lib/central/core.js';

export default async function handler (req, res) {
  const missing = requireEnv(); if (missing) return send(res, 500, { error: 'config', missing });
  if (!safeEqual(req.headers['x-admin-password'], process.env.ADMIN_PASSWORD)) {
    await new Promise(r => setTimeout(r, 600));
    return send(res, 401, { error: 'Contraseña de admin incorrecta.' });
  }
  const url = new URL(req.url, 'http://x');
  const action = url.searchParams.get('action') || 'state';

  if (req.method === 'GET' && action === 'state') {
    const [testers, downloads] = await Promise.all([readData('testers'), readData('downloads')]);
    let products = [];
    try { products = await getCatalog(); } catch (e) { products = [{ error: String(e.message || e) }]; }
    return send(res, 200, { testers: testers.data, downloads: downloads.data.slice(-300).reverse(), products });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const email = normEmail(body.email);
    if (action === 'add') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Email no válido.' });
      let created = null;
      await updateData('testers', list => {
        if (list.some(t => normEmail(t.email) === email)) return list;
        created = { email, name: String(body.name || '').slice(0, 80), code: newCode(), active: true, created: new Date().toISOString() };
        return [...list, created];
      }, `data: invite ${email}`);
      if (!created) return send(res, 409, { error: 'Ese email ya está invitado.' });
      return send(res, 200, { tester: created });
    }
    if (action === 'toggle' || action === 'regen' || action === 'remove') {
      let found = false, updated = null;
      await updateData('testers', list => {
        const out = [];
        for (const t of list) {
          if (normEmail(t.email) !== email) { out.push(t); continue; }
          found = true;
          if (action === 'remove') continue;
          updated = action === 'toggle' ? { ...t, active: t.active === false } : { ...t, code: newCode() };
          out.push(updated);
        }
        return out;
      }, `data: ${action} ${email}`);
      if (!found) return send(res, 404, { error: 'No existe ese tester.' });
      return send(res, 200, { tester: updated, removed: action === 'remove' });
    }
  }
  return send(res, 400, { error: 'acción no válida' });
}
