# Authentication Configuration Check Skill

> ⛔ **CRITICAL: Check for authentication config BEFORE any auth-dependent task.**
>
> **Failure behavior:** If config is missing/invalid, run inline auth setup (below). Do not proceed without valid configuration.
>
> **Auth-dependent tasks:** E2E tests, screenshot capture, QA browser testing, any Playwright/browser automation requiring login.

## Triggers

- Starting E2E tests that require login
- Capturing screenshots of authenticated pages
- Running QA tests on authenticated features
- Any sub-agent (e2e-playwright, qa-browser-tester, screenshot) needs to authenticate
- "auth config", "authentication check", "login required"

## Applicable Agents

- **builder** — before delegating auth-dependent tasks
- **e2e-playwright** — before writing authenticated tests
- **qa-explorer** — before testing protected features
- **qa-browser-tester** — before automating protected flows
- **screenshot** — before capturing authenticated pages

---

## Check Flow

### Step 1: Read Authentication Config

```bash
jq '.authentication' docs/project.json
```

### Step 2a: If Valid Config Exists

If `authentication` exists and is valid:
- Proceed with the auth-dependent task
- Load the appropriate auth skill (derived from `method` + `provider`)
- Pass auth config to sub-agents

### Step 2b: If Config Missing or Invalid

**Step A: Scan for auth clues**

```bash
# Check package.json for auth dependencies
cat package.json | jq -r '.dependencies // {} | keys[]' 2>/dev/null | grep -iE "supabase|next-auth|auth|clerk|firebase"

# Check for auth patterns in code
grep -r "signInWithOtp\|signInWithPassword\|signIn\|useSession" src/ app/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -3
```

**Step B: Present findings and require configuration**

```
═══════════════════════════════════════════════════════════════════════
                ⚠️ AUTHENTICATION CONFIGURATION REQUIRED
═══════════════════════════════════════════════════════════════════════

I detected authentication in your project but no `authentication` config
in `docs/project.json`.

Detected:
  • @supabase/supabase-js in package.json
  • signInWithOtp() calls found in src/lib/auth.ts

I cannot proceed with auth-dependent tasks without configuration.

OPTIONS
───────────────────────────────────────────────────────────────────────

1. Run interactive setup:
   Type: /setup-auth
   
2. Add config manually to docs/project.json:

   {
     "authentication": {
       "method": "passwordless-otp",
       "provider": "supabase",
       "testUser": {
         "type": "fixed",
         "email": "test@example.com"
       },
       "routes": {
         "login": "/login",
         "verify": "/verify",
         "authenticated": "/dashboard"
       }
     }
   }

After configuration, retry the task.

> _
═══════════════════════════════════════════════════════════════════════
```

**Step C: STOP and wait**

- Do NOT proceed with auth-dependent tasks
- Do NOT attempt to guess or hardcode auth configuration
- Do NOT offer to "try anyway"

---

## Detection Patterns

| Dependency | Provider | Likely Method |
|------------|----------|---------------|
| `@supabase/supabase-js` | supabase | Check for OTP vs password |
| `@supabase/ssr` | supabase | Check for OTP vs password |
| `next-auth` | nextauth | credentials or oauth |
| `@auth/core` | nextauth | credentials or oauth |
| `@clerk/nextjs` | clerk | oauth |
| `@auth0/auth0-react` | auth0 | oauth |

---

## Auth Skill Selection

Based on `authentication.provider` and `authentication.method`:

| Provider | Method | Auth Skill |
|----------|--------|------------|
| supabase | passwordless-otp | `auth-supabase-otp` |
| supabase | email-password | `auth-supabase-password` |
| nextauth | email-password | `auth-nextauth-credentials` |
| custom | * | `auth-generic` |

If `authentication.headless.enabled` is `true`, prefer `auth-headless` for speed.

---

## Sub-Agent Delegation with Auth

When delegating to auth-dependent sub-agents, include auth config in context:

```yaml
<context>
version: 1
project:
  path: {path}
  stack: {stack}
authentication:
  method: {method}
  provider: {provider}
  skill: {skill name}
  testUserEmail: {email}
  routes:
    login: {login path}
    authenticated: {authenticated path}
</context>
```

---

## Related Skills

- `setup-auth` — Interactive auth configuration wizard
- `auth-supabase-otp` — Supabase OTP login
- `auth-supabase-password` — Supabase password login
- `auth-nextauth-credentials` — NextAuth credentials login
- `auth-generic` — Generic/custom auth
- `auth-headless` — Headless auth session injection
