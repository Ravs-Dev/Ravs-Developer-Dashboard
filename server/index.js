import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import fileStoreFactory from 'session-file-store';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { decryptSecret, encryptSecret, generatePkcePair, safeEqual } from './security.js';
import {
  createGitHubClient,
  loadDashboard,
  loadPullRequests,
  loadReleases,
  loadWorkflowRuns,
} from './github.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_BASE_URL = (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const REQUIRED_ENV = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET', 'TOKEN_ENCRYPTION_KEY'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key] || process.env[key].startsWith('replace-'));
if (missing.length) {
  console.warn(`[RAVS Dashboard] Missing configuration: ${missing.join(', ')}. OAuth will not work until configured.`);
  if (IS_PRODUCTION) throw new Error(`Production secrets are missing: ${missing.join(', ')}`);
}
if (IS_PRODUCTION) {
  const productionMissing = [];
  if (!process.env.APP_BASE_URL) productionMissing.push('APP_BASE_URL');
  if (!process.env.SUPPORT_EMAIL) productionMissing.push('SUPPORT_EMAIL');
  if (productionMissing.length) throw new Error(`Production configuration is incomplete: ${productionMissing.join(', ')}`);
  if (new URL(APP_BASE_URL).protocol !== 'https:') throw new Error('APP_BASE_URL must use HTTPS in production.');
}
if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters.');
}
if (process.env.TOKEN_ENCRYPTION_KEY && !missing.includes('TOKEN_ENCRYPTION_KEY')) {
  // Fail during startup rather than after a user completes OAuth with a malformed key.
  encryptSecret('ravs-dashboard-key-validation', process.env.TOKEN_ENCRYPTION_KEY);
}

const sessionDir = path.resolve(process.env.SESSION_DIR || './.data/sessions');
fs.mkdirSync(sessionDir, { recursive: true });
const FileStore = fileStoreFactory(session);
const sessionStore = new FileStore({
  path: sessionDir,
  ttl: Number(process.env.SESSION_MAX_AGE_DAYS || 7) * 24 * 60 * 60,
  reapInterval: 60 * 60,
  retries: 1,
  secret: process.env.SESSION_SECRET || 'development-only-file-store-secret',
  logFn: () => {},
});

app.disable('x-powered-by');
if (IS_PRODUCTION) app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'", 'https://github.com'],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '32kb' }));
app.use(session({
  name: 'ravs.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-session-secret-32chars',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: Number(process.env.SESSION_MAX_AGE_DAYS || 7) * 24 * 60 * 60 * 1000,
    path: '/',
  },
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
app.use('/api', apiLimiter, (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function isOAuthConfigured() {
  return !missing.includes('GITHUB_CLIENT_ID')
    && !missing.includes('GITHUB_CLIENT_SECRET')
    && !missing.includes('SESSION_SECRET')
    && !missing.includes('TOKEN_ENCRYPTION_KEY');
}

function ensureAuthenticated(req, res, next) {
  if (!req.session?.encryptedAccessToken || !req.session?.user?.login) {
    return res.status(401).json({ error: 'Hubungkan akun GitHub untuk melanjutkan.' });
  }
  next();
}

function getClient(req) {
  return createGitHubClient(req.session.encryptedAccessToken, process.env.TOKEN_ENCRYPTION_KEY);
}

function getOAuthScopes() {
  return process.env.GITHUB_OAUTH_SCOPES || 'read:user';
}

function frontendRedirect(pathname) {
  const base = IS_PRODUCTION ? APP_BASE_URL : FRONTEND_ORIGIN;
  return `${base}${pathname}`;
}

function originIsAllowed(req) {
  const origin = req.get('origin');
  if (!origin) return false;
  const allowedOrigins = IS_PRODUCTION ? [APP_BASE_URL] : [APP_BASE_URL, FRONTEND_ORIGIN];
  const allowed = new Set(allowedOrigins.map((item) => {
    try { return new URL(item).origin; } catch { return ''; }
  }));
  return allowed.has(origin);
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ravs-developer-dashboard', timestamp: new Date().toISOString() });
});

app.get('/api/auth/status', (req, res) => {
  res.json({
    authenticated: Boolean(req.session?.encryptedAccessToken && req.session?.user?.login),
    user: req.session?.user ?? null,
    supportEmail: process.env.SUPPORT_EMAIL || null,
    oauthConfigured: isOAuthConfigured(),
  });
});

app.get('/api/auth/github', authLimiter, (req, res, next) => {
  if (!isOAuthConfigured()) {
    return res.status(503).send('OAuth belum dikonfigurasi. Isi GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, dan TOKEN_ENCRYPTION_KEY.');
  }
  const state = crypto.randomBytes(32).toString('base64url');
  const { verifier, challenge } = generatePkcePair();
  req.session.oauthState = state;
  req.session.pkceVerifier = verifier;
  req.session.save((error) => {
    if (error) return next(error);
    const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
    authorizeUrl.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
    authorizeUrl.searchParams.set('redirect_uri', `${APP_BASE_URL}/api/auth/github/callback`);
    authorizeUrl.searchParams.set('scope', getOAuthScopes());
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('allow_signup', 'false');
    res.redirect(authorizeUrl.toString());
  });
});

app.get('/api/auth/github/callback', authLimiter, async (req, res, next) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(frontendRedirect('/?oauth_error=denied'));
    if (typeof code !== 'string' || typeof state !== 'string'
      || !safeEqual(state, req.session?.oauthState || '')
      || typeof req.session?.pkceVerifier !== 'string') {
      return res.redirect(frontendRedirect('/?oauth_error=state'));
    }

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${APP_BASE_URL}/api/auth/github/callback`,
        code_verifier: req.session.pkceVerifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      console.error('[RAVS Dashboard] GitHub token exchange failed:', tokenData.error || tokenResponse.status);
      return res.redirect(frontendRedirect('/?oauth_error=exchange'));
    }

    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: tokenData.access_token, userAgent: 'RAVS-Developer-Dashboard/1.0.0' });
    const { data: user } = await octokit.rest.users.getAuthenticated();
    const encryptedAccessToken = encryptSecret(tokenData.access_token, process.env.TOKEN_ENCRYPTION_KEY);

    req.session.regenerate((regenerateError) => {
      if (regenerateError) return next(regenerateError);
      req.session.encryptedAccessToken = encryptedAccessToken;
      req.session.user = {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
        htmlUrl: user.html_url,
      };
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        res.redirect(frontendRedirect('/?connected=1'));
      });
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', async (req, res, next) => {
  if (!originIsAllowed(req)) return res.status(403).json({ error: 'Origin tidak diizinkan.' });

  let tokenRevoked = false;
  if (req.session?.encryptedAccessToken && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    try {
      const accessToken = decryptSecret(req.session.encryptedAccessToken, process.env.TOKEN_ENCRYPTION_KEY);
      const basicAuth = Buffer.from(`${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`).toString('base64');
      const revokeResponse = await fetch(`https://api.github.com/applications/${encodeURIComponent(process.env.GITHUB_CLIENT_ID)}/grant`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2026-03-10',
        },
        body: JSON.stringify({ access_token: accessToken }),
        signal: AbortSignal.timeout(10_000),
      });
      tokenRevoked = revokeResponse.status === 204 || revokeResponse.status === 404;
      if (!tokenRevoked) console.warn(`[RAVS Dashboard] GitHub token revocation returned HTTP ${revokeResponse.status}.`);
    } catch (error) {
      console.warn('[RAVS Dashboard] GitHub token revocation could not be completed:', error.message);
    }
  }

  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('ravs.sid', { path: '/', httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax' });
    res.status(200).json({ success: true, tokenRevoked });
  });
});

app.get('/api/dashboard', ensureAuthenticated, async (req, res, next) => {
  try {
    const data = await loadDashboard(getClient(req), req.session.user.login);
    res.json(data);
  } catch (error) { next(error); }
});

app.get('/api/pull-requests', ensureAuthenticated, async (req, res, next) => {
  try { res.json({ items: await loadPullRequests(getClient(req), req.session.user.login) }); }
  catch (error) { next(error); }
});

app.get('/api/actions', ensureAuthenticated, async (req, res, next) => {
  try {
    const octokit = getClient(req);
    const dashboard = await loadDashboard(octokit, req.session.user.login);
    res.json({ items: await loadWorkflowRuns(octokit, dashboard.repositories) });
  } catch (error) { next(error); }
});

app.get('/api/releases', ensureAuthenticated, async (req, res, next) => {
  try {
    const octokit = getClient(req);
    const dashboard = await loadDashboard(octokit, req.session.user.login);
    res.json({ items: await loadReleases(octokit, dashboard.repositories) });
  } catch (error) { next(error); }
});

// Serve the built React client from the same origin in production.
const clientDist = path.resolve('dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: IS_PRODUCTION ? '1h' : 0 }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  const status = Number(error.status || error.statusCode || 500);
  if (status === 401) return res.status(401).json({ error: 'Sesi GitHub tidak lagi valid. Hubungkan ulang akunmu.' });
  if (status === 403 && error.response?.headers?.['x-ratelimit-reset']) {
    return res.status(429).json({ error: 'Batas GitHub API tercapai. Data akan bisa dimuat kembali setelah batas waktu reset.' });
  }
  console.error('[RAVS Dashboard] Request failed:', error.message);
  res.status(status >= 400 && status < 500 ? status : 500).json({
    error: status >= 400 && status < 500 ? 'Permintaan tidak dapat diproses.' : 'Terjadi kesalahan pada server. Coba lagi sebentar.',
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`[RAVS Dashboard] Server listening on port ${PORT}`));
}

export default app;
