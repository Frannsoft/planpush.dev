# Okta SSO + RBAC Enterprise Readiness Audit

**Date:** 2026-05-28
**Goal:** Make PlanPush deployable inside an enterprise that uses Okta for auth/SSO and
needs role-based access (e.g. developers vs project managers vs QA) with industry-grade support.

## Current state (baseline)

- **Auth:** GitHub OAuth2 web flow only (`src/routes/auth.js:27-176`), `read:org` scope, optional
  GitHub org-membership gate (`auth.js:108-118`). Plus RFC 8628 device flow for the CLI.
- **Identity:** keyed on `github_user_id` (NOT NULL, UNIQUE) in `users` (`001_initial.js:7-17`);
  no email column. Session cookie + KV access-token payloads carry `github_user_id`/`github_username`.
- **Authorization:** binary `admin` / `member` role, validated as a hardcoded allowlist
  (`admin.js:41`). Checks are scattered `role === 'admin'` tests (`requireAdmin` in
  `middleware/auth.js:113-122`, `canAccessSession` in `utils/visibility.js`, dashboard scoping).
  No roles table, no permissions, no groups/teams.
- **Sessions:** stateless 7-day HMAC cookie (`middleware/auth.js:5-6,36-45`); CLI uses rotating
  refresh tokens + 60-min access tokens. Logout clears local cookie only.
- **Provisioning:** JIT on first GitHub login; first user becomes admin (`auth.js:138-151`).
  Deactivation is manual only; org membership is never re-verified after login (`auth.js:78-80`).

## Gap analysis & phasing

### Phase 1 — Identity decoupling
Add `external_idp`, `external_subject`, verified `email` to `users`; move the unique constraint off
`github_user_id` (becomes one optional linked identity). Abstract a provider interface so GitHub and
Okta can coexist or swap via config. Account-linking/migration path for existing users.

### Phase 2 — Okta OIDC login
OIDC Authorization Code + PKCE via `openid-client`: discovery doc, `nonce`, ID-token (JWT) signature
verification against Okta JWKS with key rotation/caching. JIT provisioning. De-GitHub-ify
`/api/info` (`auth.js:393-399`) and UI strings. Handle IdP-initiated login (Okta tile).

### Phase 3 — RBAC engine
`roles`, `permissions`, `role_permissions`, `user_roles` (many-to-many) tables. Permission primitive
`requirePermission('session.delete')` + `can(user, perm, resource)` helper, replacing every
`role === 'admin'` check (~15 enforcement points). Scope `canAccessSession` to a role/permission set.
Default shipped roles: admin, developer, project_manager, qa.

### Phase 4 — Group→role mapping + re-sync on login
Map Okta `groups` claim / SAML attribute → PlanPush roles via configurable rules. Re-evaluate roles on
**every** login (today role is set only at creation, `auth.js:128-152`). Replace
"first user becomes admin" bootstrap with group mapping or `INITIAL_ADMIN_EMAILS` config.

### Phase 5 — Lifecycle: SCIM, SLO, session revocation
SCIM 2.0 `/scim/v2/Users` + `/Groups` for auto-provision/deprovision. Single Logout (back/front
channel). Server-side web-session revocation + configurable idle/max-age timeouts. Audit events for
SSO login, role-mapping changes, SCIM ops.

### Phase 6 — SAML 2.0 (optional, customer-dependent)
Separate code path (`@node-saml/passport-saml`), ACS endpoint, IdP metadata ingestion, assertion
signature validation. Only if the customer mandates SAML over OIDC.

## Cross-cutting open questions

1. **OIDC, SAML, or both?** OIDC is meaningfully less work; many Okta deployments mandate SAML.
   Customer IT usually has a preference. (Drives Phase 2 vs Phase 6.)
2. **Global roles vs per-project roles?** "Different access for devs/PMs/QA" could be org-wide
   (simpler) or scoped per session/project (bigger data-model change). (Drives Phase 3.)

## Existing foundations to build on

`audit_log` table + `audit.js`; `requireAdmin` re-reads role from DB (good freshness pattern);
atomic refresh-token rotation with replay detection; `canAccessSession` single chokepoint.
