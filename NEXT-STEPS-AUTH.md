# Next Steps — Authentication (Cognito)

Status as of Nov 5, 2026. This doc is the hand-off for finishing Cognito auth.
The user pool is **live**; what remains is creating the first admin user and
confirming the end-to-end login. Everything here can be done after hours.

---

## 1. What's already done ✅

- **Cognito user pool is deployed** to AWS `us-east-1` (account `038462763287`),
  applied through the approval-gated GitHub deploy workflow
  (`.github/workflows/deploy.yml`, `target: cognito-only`).
- Public SPA app client (no secret; Authorization Code + PKCE), hosted-UI
  domain, and four role groups exist.
- The UI's local `apps/web/public/config.json` is pointed at the live pool
  (that file is gitignored — see §5 for deployed environments).

### Live pool values

| Thing | Value |
|---|---|
| User pool ID | `us-east-1_cnrU8BdrT` |
| App client ID (public, PKCE) | `4hn20jrmnnu19cabp4tv0fqhbf` |
| Issuer | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_cnrU8BdrT` |
| Hosted-UI domain | `https://pathways-cdp-dev.auth.us-east-1.amazoncognito.com` |
| Region | `us-east-1` |
| Role groups | `SystemAdmin`, `TeamMember`, `Partner`, `Customer` |

Pool config: email is the username; invite-only (`admin_create_user_only=true`,
no public sign-up); MFA off (dev); password policy = min 12 chars with
upper/lower/number/symbol.

> **Role mapping:** group names are space-free because Cognito rejects spaces.
> The app's `roleFromClaims` (UI `apps/web/src/auth/AuthProvider.tsx` and API
> `src/routes/me.ts`) normalizes `SystemAdmin` → "System Admin" and
> `TeamMember` → "Team Member" via the `cognito:groups` claim. Don't rename the
> groups without updating that normalizer.

---

## 2. Create the first admin user (the remaining manual step)

Run with credentials that have Cognito admin permissions (your admin/source
profile — **not** the limited agent profile, which has no Cognito IAM actions).
Replace the email/name.

### Option A — email an invite (temp password emailed to the user)

```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_cnrU8BdrT \
  --region us-east-1 \
  --username you@yourdomain.com \
  --user-attributes Name=email,Value=you@yourdomain.com Name=email_verified,Value=true Name=name,Value="Your Name" \
  --desired-delivery-mediums EMAIL
```

Cognito emails a temporary password; the hosted UI forces a permanent one on
first sign-in. On first sign-in the user status is `FORCE_CHANGE_PASSWORD`.

### Option B — set the password yourself (no email)

```bash
# Create without sending an invite email:
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_cnrU8BdrT \
  --region us-east-1 \
  --username you@yourdomain.com \
  --user-attributes Name=email,Value=you@yourdomain.com Name=email_verified,Value=true Name=name,Value="Your Name" \
  --message-action SUPPRESS

# Then set a permanent password (min 12 chars, upper/lower/number/symbol):
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_cnrU8BdrT \
  --region us-east-1 \
  --username you@yourdomain.com \
  --password 'YourStr0ng!Passw0rd' \
  --permanent
```

### Add the user to the SystemAdmin group (required for admin access)

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_cnrU8BdrT \
  --region us-east-1 \
  --username you@yourdomain.com \
  --group-name SystemAdmin
```

(Use `TeamMember`, `Partner`, or `Customer` for other roles.)

### Verify

```bash
aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_cnrU8BdrT \
  --region us-east-1 \
  --username you@yourdomain.com \
  --query '{status:UserStatus,enabled:Enabled}'
```

Expect `CONFIRMED` (Option B) or `FORCE_CHANGE_PASSWORD` (Option A).

---

## 3. Log in through the app (local dev)

1. Run the UI dev server on **http://localhost:5173** (the app client's only
   registered callback is `http://localhost:5173/callback`).
2. On the landing page, click **Log in** (not "Preview the app" — preview is the
   dev bypass that skips auth).
3. You'll be redirected to the Cognito hosted UI
   (`https://pathways-cdp-dev.auth.us-east-1.amazoncognito.com`), sign in, set a
   permanent password if prompted, then land back at `/callback` → the app.
4. You should appear as **System Admin** (from the `SystemAdmin` group).

If login fails, check the browser console/network tab for the token exchange
and confirm `config.json`'s `auth.*` match the table in §1.

---

## 4. Registering more callback URLs (when the UI is deployed elsewhere)

The app client currently allows only localhost callbacks. To add a deployed
origin, update these dev-env vars and re-run the deploy workflow
(`target: cognito-only`):

- `cognito_callback_urls` (add `https://<your-app-host>/callback`)
- `cognito_logout_urls` (add `https://<your-app-host>/`)

Defined in `infra/terraform/environments/dev/variables.tf`; set real values in
a `terraform.tfvars` or as TF vars. Re-run:
`gh workflow run deploy.yml -f target=cognito-only`.

---

## 5. How deployed environments get the config

`apps/web/public/config.json` is **gitignored** — it's a per-environment runtime
file. In deployed environments the web container writes `/config.json` at start
from the Terraform `runtime_config` (the UI repo's `web` module wires the
Cognito issuer/clientId straight from the pool outputs — no manual copy). Only
local dev uses the hand-edited file, which is already pointed at the live pool.

---

## 6. Agent/CLI permission note

The agent profile (`kiro-sovern-digital`) has **no Cognito IAM actions**, so it
can't create users or inspect the pool — that's why §2 is a manual step on an
admin profile. If you want this automatable later, grant a dedicated role the
Cognito admin actions (`admin-create-user`, `admin-add-user-to-group`,
`admin-set-user-password`, `describe-user-pool`, `list-groups`) scoped to this
pool ARN:
`arn:aws:cognito-idp:us-east-1:038462763287:userpool/us-east-1_cnrU8BdrT`.

---

## 7. Follow-ups (not blocking first login)

- **MFA**: off in dev. For prod set `cognito_mfa_configuration = "ON"` (+ TOTP)
  and re-apply.
- **Hosted-UI branding**: default Cognito UI; can be themed later.
- **Token lifetimes**: access/id 1h, refresh 30d (in the module) — fine for now.
- **Confirm the API `/me` flow** reads the verified token's `sub`/`cognito:groups`
  once a real user logs in (today it falls back to a dev identity).
