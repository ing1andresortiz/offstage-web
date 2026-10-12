// Invitation emails via Resend (https://resend.com). Needs RESEND_API_KEY in Vercel.
// Optional: MAIL_FROM (default "OffStage <invitaciones@weareoffstage.pro>"), MAIL_REPLY_TO, SITE_URL.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function inviteContent (t, site) {
  const first = t.name ? String(t.name).trim().split(/\s+/)[0] : '';
  const url = `${site}/central/`;
  const text =
`Hola${first ? ' ' + first : ''},

Ya tienes acceso a la beta privada de OffStage (OffStage Rack + plugins).

Entra en: ${url}
Email: ${t.email}
Código: ${t.code}

Descarga la versión de tu sistema y sigue los pasos de "Cómo instalar". Es software beta: no lo compartas fuera del grupo. Si algo falla, responde a este email con tu sistema operativo, el host y una captura.

OffStage · weareoffstage.pro`;
  const html = `<!doctype html><html><body style="margin:0;background:#070707;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#F0EBE4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#121212;border:1px solid #262626;border-radius:14px">
<tr><td style="padding:28px 28px 8px;font-size:26px;letter-spacing:1px;font-weight:700"><span style="color:#E03A38">OFFSTAGE</span> CENTRAL</td></tr>
<tr><td style="padding:0 28px;"><span style="display:inline-block;background:#F0EBE4;color:#070707;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:4px 8px;border-radius:4px">BETA PRIVADA</span></td></tr>
<tr><td style="padding:20px 28px 0;font-size:16px;line-height:1.55;color:#d8d2cb">Hola${first ? ' ' + esc(first) : ''},<br><br>Ya tienes acceso a la beta privada de <b style="color:#F0EBE4">OffStage</b>: OffStage Rack y los plugins OffStage para Mac y Windows.</td></tr>
<tr><td style="padding:22px 28px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;border:1px solid #262626;border-radius:10px">
  <tr><td style="padding:14px 16px 4px;font-size:11px;letter-spacing:1.2px;color:#9a948d;font-weight:700">EMAIL</td></tr>
  <tr><td style="padding:0 16px 10px;font-size:15px;color:#F0EBE4">${esc(t.email)}</td></tr>
  <tr><td style="padding:4px 16px 4px;font-size:11px;letter-spacing:1.2px;color:#9a948d;font-weight:700">CÓDIGO DE INVITACIÓN</td></tr>
  <tr><td style="padding:0 16px 14px;font-size:22px;letter-spacing:3px;font-family:Menlo,Consolas,monospace;color:#F0EBE4">${esc(t.code)}</td></tr>
  </table></td></tr>
<tr><td style="padding:22px 28px 0"><a href="${esc(url)}" style="display:inline-block;background:#E03A38;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:8px">Entrar a OffStage Central</a></td></tr>
<tr><td style="padding:22px 28px 28px;font-size:13px;line-height:1.55;color:#9a948d">Descarga la versión de tu sistema y sigue los pasos de "Cómo instalar". Es software beta: no lo compartas fuera del grupo de testers. Si algo falla, responde a este email con tu sistema operativo, el host y una captura.</td></tr>
</table>
<div style="font-size:12px;color:#6d6863;padding-top:16px">OffStage · weareoffstage.pro</div>
</td></tr></table></body></html>`;
  return { subject: 'Tu acceso a la beta de OffStage', text, html };
}

export async function sendInvite (t, site) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) return { sent: false, error: 'Falta RESEND_API_KEY en Vercel: la invitación se creó pero no se envió el email.' };
  const { subject, text, html } = inviteContent(t, site || process.env.SITE_URL || 'https://weareoffstage.pro');
  const body = {
    from: process.env.MAIL_FROM || 'OffStage <invitaciones@weareoffstage.pro>',
    to: [t.email], subject, text, html,
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
