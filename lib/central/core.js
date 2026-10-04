// OffStage Central — shared server helpers (Vercel Node functions, no dependencies)
import crypto from 'node:crypto';
import { PRODUCTS } from './products.js';

const API = process.env.GITHUB_API || 'https://api.github.com';
const CENTRAL_REPO = process.env.CENTRAL_REPO || 'ing1andresortiz/offstage-central';
const COOKIE = 'osc_session';
const SESSION_DAYS = 30;

// ------------------------------------------------------------------ http
export function send (res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readJson (req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export function requireEnv () {
  const missing = ['GITHUB_TOKEN', 'SESSION_SECRET', 'ADMIN_PASSWORD'].filter(k => !process.env[k]);
  return missing.length ? missing : null;
}

// ------------------------------------------------------------------ session cookie
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(data).digest('base64url');

export function makeSessionCookie (email) {
  const payload = b64u(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 864e5 }));
  const value = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function readSession (req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  const good = sign(payload);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return x > Date.now() ? { email: e } : null;
  } catch { return null; }
}

export function safeEqual (a, b) {
  const A = Buffer.from(String(a || '')), B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const newCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';           // no 0/O/1/I
  const bytes = crypto.randomBytes(10);
  let s = ''; for (const b of bytes) s += alphabet[b % alphabet.length];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
};

// ------------------------------------------------------------------ GitHub
export async function gh (path, opts = {}) {
  const r = await fetch(path.startsWith('http') ? path : API + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${(process.env.GITHUB_TOKEN || '').trim()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'offstage-central',
      ...(opts.headers || {})
    }
  });
  return r;
}

async function ghJson (path, opts) {
  const r = await gh(path, opts);
  if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status} ${path}`), { status: r.status });
  return r.json();
}

// data files (testers / downloads) live as JSON in the central repo, edited through the contents API
export async function readData (name) {
  const r = await gh(`/repos/${CENTRAL_REPO}/contents/data/${name}.json`);
  if (r.status === 404) return { data: [], sha: null };
  if (r.status === 401) throw new Error('GitHub rechaza GITHUB_TOKEN (401): el token es inválido, está caducado o se copió mal. Crea uno nuevo, pégalo en Vercel y haz Redeploy.');
  if (r.status === 403 || r.status === 404) throw new Error(`GITHUB_TOKEN no tiene acceso a ${CENTRAL_REPO} (${r.status}): en el token añade ese repo con Contents: Read and write.`);
  if (!r.ok) throw new Error(`GitHub ${r.status} reading ${name}`);
  const j = await r.json();
  return { data: JSON.parse(Buffer.from(j.content, 'base64').toString('utf8') || '[]'), sha: j.sha };
}

export async function updateData (name, mutate, message) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, sha } = await readData(name);
    const next = mutate(data);
    const r = await gh(`/repos/${CENTRAL_REPO}/contents/data/${name}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message || `data: update ${name}`,
        content: Buffer.from(JSON.stringify(next, null, 2) + '\n').toString('base64'),
        ...(sha ? { sha } : {})
      })
    });
    if (r.ok) return next;
    if (r.status !== 409 && r.status !== 422) throw new Error(`GitHub ${r.status} writing ${name}`);
    await new Promise(res => setTimeout(res, 250 * (attempt + 1)));      // concurrent write: retry
  }
  throw new Error(`could not write ${name}`);
}

export async function findTester (email) {
  const { data } = await readData('testers');
  return data.find(t => normEmail(t.email) === normEmail(email)) || null;
}

// ------------------------------------------------------------------ catalog
let cache = { at: 0, value: null };

async function versionAt (repo, sha, cmakeProject) {
  try {
    const r = await gh(`/repos/${repo}/contents/CMakeLists.txt?ref=${sha}`, { headers: { Accept: 'application/vnd.github.raw' } });
    if (!r.ok) return null;
    const m = (await r.text()).match(new RegExp(`project\\(${cmakeProject}\\s+VERSION\\s+([0-9.]+)`));
    return m ? m[1] : null;
  } catch { return null; }
}

async function latestArtifact (repo, name) {
  const j = await ghJson(`/repos/${repo}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=20`);
  return (j.artifacts || [])
    .filter(a => !a.expired && (!a.workflow_run || a.workflow_run.head_branch === 'main'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

async function productInfo (p) {
  const out = { id: p.id, name: p.name, tagline: p.tagline, kind: p.kind, guide: p.guide, platforms: {}, version: null, builtAt: null, changes: [] };
  let sha = null;
  for (const [os, cfg] of Object.entries(p.platforms)) {
    try {
      const a = await latestArtifact(p.repo, cfg.artifact);
      if (!a) continue;
      out.platforms[os] = { label: cfg.label, size: a.size_in_bytes, builtAt: a.created_at, available: true };
      if (!out.builtAt || a.created_at > out.builtAt) { out.builtAt = a.created_at; sha = a.workflow_run && a.workflow_run.head_sha; }
    } catch (e) { out.platforms[os] = { label: cfg.label, available: false, error: e.status || 'error' }; }
  }
  if (sha) out.version = await versionAt(p.repo, sha, p.cmakeProject);
  try {
    const commits = await ghJson(`/repos/${p.repo}/commits?sha=main&per_page=6`);
    out.changes = commits.map(c => ({ date: c.commit.author && c.commit.author.date, text: c.commit.message.split('\n')[0] }));
  } catch { /* changelog is optional */ }
  return out;
}

export async function getCatalog () {
  if (cache.value && Date.now() - cache.at < 60_000) return cache.value;
  const value = await Promise.all(PRODUCTS.map(productInfo));
  cache = { at: Date.now(), value };
  return value;
}

export async function artifactRedirect (productId, os) {
  const p = PRODUCTS.find(x => x.id === productId);
  const cfg = p && p.platforms[os];
  if (!cfg) return { error: 'unknown product/platform', status: 404 };
  const a = await latestArtifact(p.repo, cfg.artifact);
  if (!a) return { error: 'no build available yet', status: 404 };
  const r = await gh(`/repos/${p.repo}/actions/artifacts/${a.id}/zip`, { redirect: 'manual' });
  const location = r.headers.get('location');
  if (r.status >= 300 && r.status < 400 && location) {
    const version = a.workflow_run ? await versionAt(p.repo, a.workflow_run.head_sha, p.cmakeProject) : null;
    return { location, product: p, artifact: a, version };
  }
  return { error: `GitHub ${r.status}`, status: 502 };
}
