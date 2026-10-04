import { send, clearSessionCookie } from '../../lib/central/core.js';
export default function handler (req, res) {
  return send(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
}
