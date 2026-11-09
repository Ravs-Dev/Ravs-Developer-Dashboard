# RAVS Developer Dashboard

A secure, responsive GitHub dashboard for the **Ravs-Dev** developer workspace. It uses the GitHub REST API through a server-side Express backend and a React/Vite frontend.

## Features

- GitHub OAuth 2.0 Authorization Code flow with **PKCE S256** and state validation.
- Stateless session cookies encrypted with AES-256-GCM, `HttpOnly`, `SameSite=Lax`, and production `Secure` flags.
- The OAuth access token is separately encrypted with AES-256-GCM before being included in the encrypted session cookie.
- Dashboard metrics for public repositories, stars, forks, followers, and language distribution.
- Repository search and cards.
- Recently authored public Pull Requests.
- GitHub Actions workflow runs across recently updated public repositories.
- Release feed across recently updated public repositories.
- Rate limiting, Helmet security headers, CSP, request size limit, no-store API responses, and OAuth callback validation.
- Vercel deployment configuration, Docker Compose for self-hosting, CI checks, and security documentation.

> **Access model:** the default OAuth scopes are `read:user`. This deliberately keeps the initial connection low-privilege. The dashboard currently reads public repository data. It does not request broad write access to private repositories. If private-repository support is required later, prefer a GitHub App with only the specific read-only repository permissions needed.

## Requirements

- Node.js 22.12+ (Node 26 LTS is recommended for production deployments).
- npm 10+.
- A GitHub OAuth App.

## 1. Create a GitHub OAuth App

Open [GitHub Developer Settings](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**.

For local development, use:

| Field | Value |
|---|---|
| Application name | RAVS Developer Dashboard |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/api/auth/github/callback` |

Copy the Client ID and generate a Client Secret. Keep the secret private. Never put either secret in frontend source code or a `VITE_*` variable.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Generate strong secrets:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # TOKEN_ENCRYPTION_KEY
```

Then update `.env`:

```dotenv
NODE_ENV=development
PORT=3000
APP_BASE_URL=http://localhost:3000
FRONTEND_ORIGIN=http://localhost:5173
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_OAUTH_SCOPES=read:user
SESSION_SECRET=64-hex-characters-from-openssl
TOKEN_ENCRYPTION_KEY=64-hex-characters-from-openssl
SESSION_DIR=./.data/sessions
SESSION_MAX_AGE_DAYS=7
SUPPORT_EMAIL=your-real-support-inbox@example.com
```

`SUPPORT_EMAIL` must be an address you own and actively monitor before public launch. It is surfaced in the dashboard footer when configured.

## 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` requests to the Express backend on port 3000.

## 4. Verify the app

```bash
npm test
npm run build
npm start
```

The health endpoint is available at `http://localhost:3000/api/health`.

## OAuth and security design

1. The server creates a random `state` value and PKCE verifier, stores both in the server-side session, and redirects to GitHub with an S256 challenge.
2. GitHub returns an authorization code. The server compares the returned state with a timing-safe comparison and exchanges the code with the stored PKCE verifier.
3. The server fetches the authenticated GitHub profile and regenerates the session ID to mitigate session fixation.
4. The access token is encrypted with AES-256-GCM before it is stored in the server-side session file. The encryption key is only read from server environment variables.
5. The browser receives only an opaque session cookie. The token is never returned to client JavaScript or placed in local/session storage.
6. GitHub data endpoints are read-only. Logout checks the request origin, attempts to revoke the GitHub OAuth app grant, and then destroys the local session. If GitHub cannot confirm revocation, the UI directs the user to remove the app from GitHub Settings → Applications.

See [SECURITY.md](SECURITY.md) for reporting and operational guidance.

## Deploy with Docker Compose

1. Configure `.env` with production values and set `APP_BASE_URL` to your HTTPS hostname.
2. Set `FRONTEND_ORIGIN` to the same HTTPS origin.
3. In your GitHub OAuth App, set Homepage URL to `APP_BASE_URL` and callback URL to `${APP_BASE_URL}/api/auth/github/callback`.
4. Run:

```bash
docker compose up --build -d
```

The Compose file mounts a persistent volume at `/var/data` for encrypted sessions. Put a reverse proxy with HTTPS in front of the app if exposing it directly to the internet. `NODE_ENV=production` enables secure cookies; do not disable this in a public deployment.

## Deploy to Vercel (Hobby)

1. Import this repository into Vercel and keep the project root at the repository root.
2. Vercel detects the Express entrypoint in the root `index.js`; the Vite build writes frontend assets to `public/`, which Vercel serves through its CDN.
3. Add these Production Environment Variables in Project Settings → Environment Variables: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, and `SUPPORT_EMAIL`. Generate the two secrets with `openssl rand -hex 32`. Set `APP_BASE_URL` and `FRONTEND_ORIGIN` to the stable production `https://<project>.vercel.app` URL after Vercel assigns it. `VERCEL_PROJECT_PRODUCTION_URL` is used as a fallback during initial provisioning.
4. Redeploy after setting environment variables.
5. In the GitHub OAuth App, set Homepage URL to `APP_BASE_URL` and Authorization callback URL to `${APP_BASE_URL}/api/auth/github/callback`.

The Vercel adapter uses encrypted, stateless browser sessions because serverless instances must not depend on a persistent local filesystem. Sessions expire after one day by default. The Vercel Hobby plan is intended for personal, non-commercial use and has usage limits; check Vercel's current plan terms before using it for a commercial service.

## GitHub Developer Program readiness

This project demonstrates an application that integrates with the GitHub REST API. Before presenting it as a production integration, do all of the following:

- Deploy it to a stable HTTPS URL.
- Configure a support email address that users can actually contact.
- Keep the OAuth App description, homepage, and callback URL accurate.
- Test authorization, denied authorization, logout, session persistence, rate limiting, and API failure handling.
- Publish a concise public README and a security policy.

Membership in the GitHub Developer Program and eligibility/display of any profile highlight are determined by GitHub. This repository does **not** guarantee a profile badge or approval.

Official reference: [GitHub Developer Program](https://docs.github.com/en/integrations/concepts/github-developer-program).

## Project structure

```text
client/                 React frontend
  src/App.jsx           Dashboard screens and UI
  src/styles.css        Responsive dark UI
index.js                Vercel Express entrypoint
server/                 Express backend
  index.js              OAuth routes, encrypted cookie sessions, API routes, local static hosting
  cookie-session.js     Stateless AES-GCM encrypted session middleware
  github.js              GitHub REST queries and short-lived response cache
  security.js            PKCE, timing-safe comparison, AES-GCM helpers
tests/                   Node test suite
.github/workflows/       CI checks
Dockerfile               Production container
compose.yaml              Persistent local/self-hosted deployment
render.yaml              Render Blueprint template
```

## License

MIT. See [LICENSE](LICENSE).
