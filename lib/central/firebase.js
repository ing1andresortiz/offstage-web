// TourDesk desde OffStage Central: tokens de acceso de Firebase ("custom tokens") firmados aquí, sin dependencias.
// Necesita FIREBASE_SERVICE_ACCOUNT en Vercel: el JSON de la cuenta de servicio del proyecto tourdesk-offstage
// (Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada).
// La clave nunca sale del servidor: al navegador solo llega un token que caduca en 15 minutos.
import crypto from 'node:crypto';

const AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const TTL = 15 * 60;

let cache = { raw: null, sa: null };

export function serviceAccount () {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  if (cache.raw === raw) return cache.sa;
  let j;
  try { j = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT no es un JSON válido: pega el contenido completo del archivo .json de la cuenta de servicio.'); }
  if (!j || !j.client_email || !j.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT está incompleto: faltan client_email o private_key.');
  const key = String(j.private_key).replace(/\\n/g, '\n');
  try { crypto.createPrivateKey(key); } catch { throw new Error('La private_key de FIREBASE_SERVICE_ACCOUNT no es válida.'); }
  cache = { raw, sa: { email: j.client_email, key, projectId: j.project_id || '' } };
  return cache.sa;
}

export const firebaseReady = () => { try { return !!serviceAccount(); } catch { return false; } };

// Cada tester tiene un uid fijo derivado de su email: "t_" + 24 hex. Las reglas de Firestore solo dejan
// a ese uid tocar sus propios documentos (w_<uid>__*). Los uids normales de Firebase nunca llevan "_",
// así que nadie que no venga de la central puede hacerse pasar por un tester.
export const tourdeskUid = (email) =>
  't_' + crypto.createHash('sha256').update('tourdesk|' + String(email || '').trim().toLowerCase()).digest('hex').slice(0, 24);

// Ojo: nunca poner "email" en claims (las reglas de TourDesk dan permisos por request.auth.token.email).
export function customToken (uid, claims = {}) {
  const sa = serviceAccount();
  if (!sa) throw Object.assign(new Error('Falta FIREBASE_SERVICE_ACCOUNT en Vercel.'), { code: 'config' });
  if (!/^t_[0-9a-f]{24}$/.test(uid)) throw new Error('uid de tester no válido');
  for (const k of Object.keys(claims)) if (/^(email|email_verified|firebase|sub|aud|iss|iat|exp|nbf|jti|uid)$/i.test(k)) throw new Error(`claim reservado: ${k}`);
  const iat = Math.floor(Date.now() / 1000) - 30;            // margen por si el reloj va adelantado
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: sa.email, sub: sa.email, aud: AUD, iat, exp: iat + TTL, uid, claims })}`;
  return `${body}.${crypto.sign('sha256', Buffer.from(body), sa.key).toString('base64url')}`;
}
