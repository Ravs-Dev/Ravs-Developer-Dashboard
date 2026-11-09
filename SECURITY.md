# Security Policy

## Supported deployment

Use the latest release on a supported Node.js LTS line. Keep dependencies updated and deploy only behind HTTPS.

## Reporting a vulnerability

Do not publish exploit details in a public issue. Contact the maintainer through the support address configured for the deployment, or use GitHub's private vulnerability reporting when enabled for this repository.

## Security controls

- OAuth Authorization Code flow with PKCE S256 and a random state value.
- The OAuth client secret and token-encryption key remain server-side.
- Access tokens are AES-256-GCM encrypted before being stored in the session file.
- The session cookie is HttpOnly and SameSite=Lax; Secure is enabled in production.
- Session ID is regenerated after successful authentication.
- Read-only application routes and least-privilege default OAuth scopes (`read:user`).
- Helmet security headers, Content Security Policy, rate limiting, request body limits, and no-store API responses.

## Operational requirements

- Use unique secrets in every environment. Rotate the GitHub OAuth client secret and encryption key if exposure is suspected.
- Back up the persistent session volume securely. Session files contain encrypted tokens and should still be treated as sensitive data.
- Do not commit `.env`, OAuth secrets, raw access tokens, or session data.
- Restrict server and deployment-provider access.
- Keep `NODE_ENV=production`, `APP_BASE_URL`, and `FRONTEND_ORIGIN` correct for the HTTPS deployment.
- The default OAuth scopes intentionally avoid private repository permissions. Do not add broad scopes without documenting the impact and obtaining explicit user consent.
