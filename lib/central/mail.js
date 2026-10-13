// Invitation emails via Resend (https://resend.com). Needs RESEND_API_KEY in Vercel.
// Optional: MAIL_FROM (default "OffStage <invitaciones@weareoffstage.pro>"), MAIL_REPLY_TO, SITE_URL.
import { PRODUCTS } from './products.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const joinEs = (a) => a.length < 2 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`;

// El texto cambia según los productos de la invitación (sin campo products = todos, como los testers antiguos)
function inviteParts (t) {
  const list = PRODUCTS.filter(p => !Array.isArray(t.products) || t.products.includes(p.id));
  const apps = list.filter(p => !p.web), tourdesk = list.some(p => p.id === 'tourdesk');
  const appHost = String(process.env.TOURDESK_URL || 'https://tourdesk-pro.vercel.app').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const allApps = PRODUCTS.filter(p => !p.web).every(p => apps.includes(p));
  const appsTxt = allApps ? 'OffStage Rack + plugins' : joinEs(apps.map(p => p.name));
  const appsHtml = allApps ? 'OffStage Rack y los plugins OffStage para Mac y Windows' : `${esc(joinEs(apps.map(p => p.name)))} para Mac y Windows`;
  const tdHtml = '<b style="color:#F0EBE4">TourDesk</b>, la app de OffStage para producir giras';
  const what = !tourdesk ? appsTxt : !apps.length ? 'TourDesk, la app de OffStage para producir giras' : `${appsTxt} y TourDesk`;
  const whatHtml = !tourdesk ? appsHtml : !apps.length ? tdHtml : `${appsHtml}, y ${tdHtml}`;
  const steps = [];
  if (apps.length) steps.push('Descarga la versión de tu sistema y sigue los pasos de "Cómo instalar". Es software beta: no lo compartas fuera del grupo. Si algo falla, responde a este email con tu sistema operativo, el host y una captura.');
  if (tourdesk) steps.push(`TourDesk: en la central pulsa "Abrir TourDesk" y entras directo. En el móvil también puedes abrir ${appHost} y entrar con "Tengo invitación a la beta" usando este email y este código.${apps.length ? '' : ' Es una beta privada: no compartas tu código. Si algo falla o se te ocurre una mejora, responde a este email.'}`);
  return { what, whatHtml, steps, subject: tourdesk && !apps.length ? 'Tu acceso a la beta de TourDesk' : 'Tu acceso a la beta de OffStage' };
}

export function inviteContent (t, site) {
  const first = t.name ? String(t.name).trim().split(/\s+/)[0] : '';
  const url = `${site}/central/`;
  const { what, whatHtml, steps, subject } = inviteParts(t);
  const text =
`Hola${first ? ' ' + first : ''},

Ya tienes acceso a la beta privada de OffStage (${what}).

Entra en: ${url}
Email: ${t.email}
Código: ${t.code}

${steps.join('\n\n')}

OffStage · weareoffstage.pro`;
  const html = `<!doctype html><html><body style="margin:0;background:#070707;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#F0EBE4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#121212;border:1px solid #262626;border-radius:14px">
<tr><td style="padding:28px 28px 8px;font-size:26px;letter-spacing:1px;font-weight:700"><span style="color:#E03A38">OFFSTAGE</span> CENTRAL</td></tr>
<tr><td style="padding:0 28px;"><span style="display:inline-block;background:#F0EBE4;color:#070707;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:4px 8px;border-radius:4px">BETA PRIVADA</span></td></tr>
<tr><td style="padding:20px 28px 0;font-size:16px;line-height:1.55;color:#d8d2cb">Hola${first ? ' ' + esc(first) : ''},<br><br>Ya tienes acceso a la beta privada de <b style="color:#F0EBE4">OffStage</b>: ${whatHtml}.</td></tr>
<tr><td style="padding:22px 28px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;border:1px solid #262626;border-radius:10px">
  <tr><td style="padding:14px 16px 4px;font-size:11px;letter-spacing:1.2px;color:#9a948d;font-weight:700">EMAIL</td></tr>
  <tr><td style="padding:0 16px 10px;font-size:15px;color:#F0EBE4">${esc(t.email)}</td></tr>
  <tr><td style="padding:4px 16px 4px;font-size:11px;letter-spacing:1.2px;color:#9a948d;font-weight:700">CÓDIGO DE INVITACIÓN</td></tr>
  <tr><td style="padding:0 16px 14px;font-size:22px;letter-spacing:3px;font-family:Menlo,Consolas,monospace;color:#F0EBE4">${esc(t.code)}</td></tr>
  </table></td></tr>
<tr><td style="padding:22px 28px 0"><a href="${esc(url)}" style="display:inline-block;background:#E03A38;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:8px">Entrar a OffStage Central</a></td></tr>
${steps.map((s, i) => `<tr><td style="padding:${i ? '12px' : '22px'} 28px ${i === steps.length - 1 ? '28px' : '0'};font-size:13px;line-height:1.55;color:#9a948d">${esc(s)}</td></tr>`).join('\n')}
</table>
<div style="font-size:12px;color:#6d6863;padding-top:16px">OffStage · weareoffstage.pro</div>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function sendInvite (t, site) {
  const { subject, text, html } = inviteContent(t, site || process.env.SITE_URL || 'https://weareoffstage.pro');
  return sendMail({ to: t.email, subject, text, html }, 'Falta RESEND_API_KEY en Vercel: la invitación se creó pero no se envió el email.');
}

// Aviso a Andrés de cada alta desde la web (a MAIL_NOTIFY, o a MAIL_REPLY_TO, o andres@weareoffstage.pro)
export function notifyOwner (subject, lines, site) {
  const to = process.env.MAIL_NOTIFY || process.env.MAIL_REPLY_TO || 'andres@weareoffstage.pro';
  const admin = `${site || process.env.SITE_URL || 'https://weareoffstage.pro'}/central/admin.html`;
  const text = `${lines.join('\n')}\n\nAdmin: ${admin}`;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111">${lines.map(l => `<div>${esc(l)}</div>`).join('')}<p><a href="${esc(admin)}">Abrir el admin de OffStage Central</a></p></div>`;
  return sendMail({ to, subject, text, html });
}

export async function sendMail ({ to, subject, text, html }, missingMsg) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) return { sent: false, error: missingMsg || 'Falta RESEND_API_KEY en Vercel.' };
  const body = {
    from: process.env.MAIL_FROM || 'OffStage <invitaciones@weareoffstage.pro>',
    to: [to], subject, text, html,
    reply_to: process.env.MAIL_REPLY_TO || 'andres@weareoffstage.pro'
  };
  try {
    const r = await fetch(process.env.RESEND_API || 'https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { sent: false, error: `Resend ${r.status}: ${j.message || j.name || 'error'}` };
    return { sent: true, id: j.id };
  } catch (e) {
    return { sent: false, error: `No se pudo contactar con Resend: ${e.message || e}` };
  }
}
