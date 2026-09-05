# OAuth, forgot password, signup OTP verification, password toggle — design

Status: approved by user, ready for implementation planning.

## Context

The repo has a working Express + TypeScript + raw `pg` auth module
(`backend/src/modules/auth/`): register, login, refresh, logout, me. Tokens
are stateless JWTs (access + refresh, distinct secrets), returned in the
response body and stored client-side (`localStorage` refresh token,
in-memory access token) — see `frontend/src/features/auth/AuthProvider.tsx`.

The `users` table (`db/migrations/000001_initial_schema.up.sql`) already
anticipates federated identity: `auth_provider`, `provider_user_id`, a
partial unique index on the pair, and a check that `auth_provider IN
('google', 'microsoft')`. Nothing populates these columns yet. There is no
email-sending, no OTP, no password-reset, and no email-sending dependency
(`nodemailer`, provider SDKs, etc.) in `backend/package.json`.

This spec adds four things: Google OAuth login/signup, forgot-password via
emailed reset link, mandatory email-OTP verification at signup, and a
password-visibility toggle on password inputs. Decisions made with the user,
in order:

1. **OAuth provider: Google only.** Schema also allows `microsoft`; not
   implemented in this pass.
2. **OAuth flow: backend authorization-code redirect**, not a frontend
   ID-token flow. Backend owns the callback, exchanges the code, issues our
   own JWTs. Tokens are returned to the frontend via a URL fragment (not
   query string, so they don't land in server access logs) on redirect to
   `/oauth/callback`.
3. **Email delivery: SMTP via nodemailer.** New dependency `nodemailer` +
   `@types/nodemailer`. A single `sendMail()` seam in
   `backend/src/lib/mailer.ts` so the transport can change later without
   touching call sites.
4. **Signup OTP: email-based 6-digit code, login is blocked until
   verified.** `register` no longer returns a session — it returns
   `{ user, needsVerification: true }`. The session is issued when the OTP
   is confirmed.
5. **Forgot password: emailed reset link** with a signed, short-lived,
   single-use token (not an OTP code) — `/reset-password?token=...`.
6. **New-user OAuth signup (no branch_id yet):** a pending-profile screen.
   The callback for an unrecognized identity issues a short-TTL signed
   `oauth_pending` token (not a session) and redirects to
   `/oauth/complete#pending=<token>`, where the user picks a branch and
   `POST /api/auth/google/complete` creates the real account.
7. **Account linking:** if a Google sign-in's email matches an existing
   password-based account, and Google reports that email as verified on
   their side, the provider identity is attached to that existing row
   (`auth_provider`/`provider_user_id` set) rather than rejected or
   duplicated. From then on the user can sign in either way.
8. **Unverified re-register:** registering again with an email that already
   has an unverified row replaces that row (new password hash, fresh OTP)
   instead of `409 EMAIL_TAKEN`. Once `email_verified = true`, normal `409`
   behavior applies.
9. **Non-enumeration:** `POST /api/auth/forgot-password` always returns
   `200`, regardless of whether the email exists or has a password. This is
   scoped to that endpoint only — `register`'s existing `409 EMAIL_TAKEN`
   behavior is untouched (already a known enumeration vector, out of scope
   here).
10. **Rate limiting:** no new middleware/dependency. OTP send and
    reset-link send each check `created_at` on the most recent row for that
    user and reject a new send within 60s of the last one.

## Scope

In scope:
- `email_otps` and `password_reset_tokens` tables; `users.email_verified`.
- Auth service/controller/routes: `verify-email`, `resend-otp`,
  `forgot-password`, `reset-password`, `google` (redirect),
  `google/callback`, `google/complete`. Changes to `register` and `login`.
- `backend/src/lib/mailer.ts` (nodemailer, SMTP).
- Frontend: new routes (`/verify-email`, `/forgot-password`,
  `/reset-password`, `/oauth/callback`, `/oauth/complete`), a shared
  `PasswordInput` component with a show/hide toggle used everywhere a
  password is entered, `AuthProvider`/`auth-context` changes for the new
  flows, a "Continue with Google" button on login/register.
- Backend + frontend tests for the new flows and edge cases below.

Out of scope: Microsoft OAuth, SMS OTP, session/refresh-token revocation
changes, rate-limiting middleware, 2FA for existing accounts, "forgot
password" for OAuth-only accounts setting a password (schema permits it via
`users_has_auth_method`, but no UI/endpoint is added for it in this pass).

## Data model

`db/migrations/000002_auth_extensions.up.sql`:

```sql
ALTER TABLE users
    ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

-- Pre-existing rows predate verification; don't lock out current users.
UPDATE users SET email_verified = true;

CREATE TABLE email_otps (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempts    SMALLINT    NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_otps_user_id_idx ON email_otps (user_id);

CREATE TABLE password_reset_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
```

`down` reverses both creates and the column add (the `UPDATE` has no
inverse; that's expected of a backfill).

Both OTP codes and reset tokens are stored **hashed** (sha256 is enough —
these are short-lived, single-use, high-entropy-for-tokens/low-entropy-for-
OTP-but-attempt-capped secrets, not passwords), never in plaintext. Both
tables model single-use via `consumed_at IS NULL` rather than deleting rows,
so a reused code/token gets a clear "already used" error instead of "not
found". Latest-row-per-user (`ORDER BY created_at DESC LIMIT 1`) is how
"the current active code/token" is found; older rows for the same user are
simply superseded, not deleted (cheap, and DELETE isn't needed for
correctness).

## Backend

### `backend/src/lib/mailer.ts`

```ts
export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void>
```

One nodemailer transport built from `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `MAIL_FROM` (env). Two callers: OTP email, reset-link email.

### `backend/src/modules/auth/auth.service.ts` changes

- `registerStudent`: insert with `email_verified = false`. On unique
  violation, check whether the conflicting row has `email_verified = false`;
  if so, `UPDATE` that row (email, full_name, password_hash, branch_id) in
  place instead of raising `409`, then proceed to issue a fresh OTP. If the
  conflicting row is verified, `409 EMAIL_TAKEN` as today. Returns
  `{ user, needsVerification: true }` — no `tokens`.
- New `sendVerificationOtp(userId, email)`: generate 6-digit code
  (`crypto.randomInt(100000, 999999)`), hash it, insert into `email_otps`
  with a 10-minute expiry, email it via `sendMail`.
- New `verifyEmail(email, code)`: load latest unconsumed `email_otps` row
  for the user; `410 OTP_EXPIRED` if past `expires_at`; increment
  `attempts` and `401 INVALID_CODE` if hash mismatch (cap at 5 attempts →
  `429 TOO_MANY_ATTEMPTS`); on match, consume the row, set
  `users.email_verified = true`, return `{ user, tokens }` — this is where
  the signup session is actually issued.
- New `resendOtp(email)`: 60s guard against the latest row's `created_at`
  (`429 RATE_LIMITED` with a `retryAfter` seconds hint if too soon),
  otherwise same as `sendVerificationOtp`. Always responds success-shaped
  even if the email doesn't exist or is already verified (avoid leaking
  which).
- `login`: after password verification succeeds, check
  `row.email_verified`; if false, `403 EMAIL_NOT_VERIFIED`.
- New `forgotPassword(email)`: look up user; if none, or
  `password_hash IS NULL` (OAuth-only account), do nothing — always
  resolves. Otherwise generate a random 32-byte token, hash it, insert into
  `password_reset_tokens` (1-hour expiry, same 60s resend guard), email a
  link `${APP_URL}/reset-password?token=<raw token>`.
- New `resetPassword(token, newPassword)`: hash the incoming token, look up
  by `token_hash`; `400 INVALID_TOKEN` if not found, `410 TOKEN_EXPIRED` if
  past expiry, `410 TOKEN_USED` if already consumed. On success, update
  `users.password_hash`, consume the token.
- New `googleAuthUrl()`: build the Google OAuth consent URL with a signed
  `state` JWT (short TTL, purpose claim `oauth_state`) for CSRF protection.
- New `handleGoogleCallback(code, state)`: verify `state`; exchange `code`
  for tokens via Google's token endpoint; fetch profile (`sub`, `email`,
  `email_verified`, `name`). Lookup order:
  1. `auth_provider='google' AND provider_user_id=sub` → existing OAuth
     user → issue tokens.
  2. No provider match, but `email` matches an existing row → if Google's
     `email_verified` is true, `UPDATE` that row to set
     `auth_provider='google', provider_user_id=sub` (link), issue tokens.
     If Google's `email_verified` is false, treat as no match (fall
     through) rather than link an unconfirmed address.
  3. No match at all → sign an `oauth_pending` JWT (claims: `provider`,
     `provider_user_id`, `email`, `full_name`, purpose `oauth_pending`,
     ~15 min TTL) and return it for the pending-profile redirect.
- New `completeGoogleSignup(pendingToken, branchId)`: verify the
  `oauth_pending` JWT; insert a new user row (`role='student'`,
  `email_verified=true`, `auth_provider`/`provider_user_id` from the token,
  no `password_hash`, given `branch_id`); issue tokens. Same
  foreign-key/check-violation handling as `registerStudent` for a bad
  `branch_id`.

### Routes/controller

- `POST /api/auth/verify-email` `{email, code}`
- `POST /api/auth/resend-otp` `{email}`
- `POST /api/auth/forgot-password` `{email}`
- `POST /api/auth/reset-password` `{token, password}`
- `GET /api/auth/google` → `302` to `googleAuthUrl()`
- `GET /api/auth/google/callback?code&state` → on success with tokens,
  `302` to `${APP_URL}/oauth/callback#accessToken=...&refreshToken=...`; on
  success-but-pending, `302` to
  `${APP_URL}/oauth/complete#pending=<token>`; on failure, `302` to
  `${APP_URL}/login?error=oauth_failed`.
- `POST /api/auth/google/complete` `{pendingToken, branch_id}`

All new POST bodies validated with `zod`, matching the existing pattern in
`auth.controller.ts`.

### Env (`backend/.env.example` additions)

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
APP_URL=http://localhost:5173

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Revisex <no-reply@revisex.app>"
```

## Frontend

- `frontend/src/features/auth/auth-context.ts`: `register`'s return type
  changes to `Promise<{ needsVerification: boolean; email: string }>` (no
  longer implicitly authenticates). New methods on `AuthContextValue`:
  `verifyEmail(email, code)`, `resendOtp(email)`,
  `forgotPassword(email)`, `resetPassword(token, password)`,
  `completeOAuthProfile(pendingToken, branchId)` — the last three don't
  need to touch session state beyond what `verifyEmail`/
  `completeOAuthProfile` already do (both end in `applySession`).
- `AuthProvider.tsx`: `register` calls the endpoint and returns the
  `needsVerification` shape directly (no `applySession`). `verifyEmail` and
  `completeOAuthProfile` call their endpoints and `applySession` the
  result, mirroring `login`.
- `RegisterForm.tsx`: on success, navigate to
  `/verify-email?email=<email>` instead of calling `onSuccess`.
- New `frontend/src/routes/VerifyEmailPage.tsx`: reads `email` from query,
  6-digit code input, calls `verifyEmail`; a "resend code" link calls
  `resendOtp` with a 60s disabled-state cooldown.
- New `frontend/src/routes/ForgotPasswordPage.tsx`: email input, calls
  `forgotPassword`, always shows the same "if that email exists, check your
  inbox" message.
- New `frontend/src/routes/ResetPasswordPage.tsx`: reads `token` from
  query, new-password field (with the toggle), calls `resetPassword`,
  redirects to `/login` on success.
- New `frontend/src/routes/OAuthCallbackPage.tsx`: reads
  `accessToken`/`refreshToken` from `location.hash`, calls a new
  `AuthProvider` method (`applyOAuthSession`, thin wrapper around the
  existing `applySession` + a `GET /api/auth/me` to populate `user` since
  the fragment doesn't carry the user object), redirects to `/home`.
  Strips the fragment immediately (`history.replaceState`) so tokens don't
  linger in browser history.
- New `frontend/src/routes/OAuthCompletePage.tsx`: reads `pending` from
  `location.hash`, a branch picker (reuse whatever component
  `RegisterForm` uses for `branch_id`), calls `completeOAuthProfile`.
- `router.tsx`: register the five new routes above (outside
  `ProtectedRoute`, alongside `login`/`register`).
- New `frontend/src/components/ui/password-input.tsx`: wraps the existing
  `Input` component, toggles `type="password"`/`type="text"`, `Eye`/
  `EyeOff` icons from `lucide-react`, toggle button is `type="button"` so
  it never submits the form. Replaces the raw `<Input type="password">` in
  `LoginForm.tsx`, `RegisterForm.tsx`, and is used in
  `ResetPasswordPage.tsx`.
- `LoginPage`/`RegisterPage`: a "Continue with Google" button that is a
  plain `<a href="/api/auth/google">` (full navigation, not a fetch —
  the backend redirect flow requires a real page load to follow Google's
  redirect chain).

## Error handling

New `ApiError` codes, following the existing `{ success: false, error:
{ code, message } }` envelope:

| Code | Status | When |
|---|---|---|
| `EMAIL_NOT_VERIFIED` | 403 | login before OTP verification |
| `OTP_EXPIRED` | 410 | code past `expires_at` |
| `INVALID_CODE` | 401 | wrong code |
| `TOO_MANY_ATTEMPTS` | 429 | 5th+ wrong code on one OTP row |
| `RATE_LIMITED` | 429 | resend/reset requested within 60s of last |
| `INVALID_TOKEN` | 400 | reset token not found, or oauth_pending/state JWT invalid |
| `TOKEN_EXPIRED` | 410 | reset token past expiry |
| `TOKEN_USED` | 410 | reset token already consumed |

OAuth callback failures (bad `state`, Google error response, token exchange
failure) never surface raw error details to the browser — they redirect to
`/login?error=oauth_failed` and the frontend shows a generic message.

## Testing

`backend/tests/modules/auth.test.ts` additions:
- register → returns `needsVerification`, no tokens; OTP row created.
- register again with same (unverified) email → replaces row, doesn't 409.
- register again with same (verified) email → 409 as before (regression).
- verify-email: correct code → tokens + `email_verified=true`; wrong code
  → 401 and `attempts` increments; 6th wrong attempt → 429; expired code →
  410.
- resend-otp: within 60s → 429; after → new code works, old code no longer
  does (superseded).
- login with unverified account → 403 `EMAIL_NOT_VERIFIED`.
- forgot-password: existing password account → 200 + email sent (assert
  via mocked `sendMail`); nonexistent email → 200, no email sent; OAuth-only
  account → 200, no email sent (same external response either way).
- reset-password: valid token → password changed, can log in with it;
  reused token → 410 `TOKEN_USED`; expired token → 410 `TOKEN_EXPIRED`.
- google/callback: new identity → pending redirect with signed token;
  known provider id → session redirect; matching verified email, no prior
  link → account gets linked, session redirect; matching unverified email
  → falls through to pending (not linked).
- google/complete: valid pending token + branch_id → account created,
  verified, tokens issued; invalid/expired pending token → 400/410.

Frontend: a test that the password toggle switches `type` and never
triggers form submission; a test that `RegisterForm` navigates to
`/verify-email` on success instead of authenticating immediately.

## Migration/compat notes

- Existing users get `email_verified = true` via backfill — no forced
  re-verification for the current user base.
- `logout`, `refresh`, `me` are unchanged.
- The refresh-token statelessness/no-revocation limitation (documented in
  the original auth design) is unchanged and out of scope here.
