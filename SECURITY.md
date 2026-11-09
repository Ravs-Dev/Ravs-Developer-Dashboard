# Security Policy

## Supported deployment

Use the latest release on a supported Node.js LTS line. Keep dependencies updated and deploy only behind HTTPS.

## Reporting a vulnerability

Do not publish exploit details in a public issue. Contact the maintainer through the support address configured for the deployment, or use GitHub's private vulnerability reporting when enabled for this repository.

## Security controls

- OAuth Authorization Code flow with PKCE S256 and a random state value.
- The OAuth client secret and token-encryption key remain server-side.
- The session payload (including the separately AES-256-GCM encrypted OAuth token) is encrypted with AES-256-GCM before being placed in a short-lived HttpOnly cookie. No server filesystem is used for authentication state.
- The session cookie is HttpOnly and SameSite=Lax; Secure is enabled in production. Its contents are authenticated-encrypted, expire after one day by default, and are not readable by browser JavaScript.
- Temporary OAuth state is discarded before the authenticated session cookie is issued, preventing reuse of the pre-authentication state.
- Read-only application routes and least-privilege default OAuth scopes (`read:user`).
- Helmet security headers, Content Security Policy, rate limiting, request body limits, and no-store API responses.

## Operational requirements

- Use unique secrets in every environment. Rotate the GitHub OAuth client secret and encryption key if exposure is suspected.
- Keep SESSION_SECRET and TOKEN_ENCRYPTION_KEY private and stable. Rotating either key invalidates existing browser sessions.
- Do not commit `.env`, OAuth secrets, raw access tokens, or session data.
- Restrict server and deployment-provider access.
- Keep `NODE_ENV=production`, `APP_BASE_URL`, and `FRONTEND_ORIGIN` correct for the HTTPS deployment.
- The default OAuth scopes intentionally avoid private repository permissions. Do not add broad scopes without documenting the impact and obtaining explicit user consent.
