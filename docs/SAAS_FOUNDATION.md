# SmartBarrio SaaS foundation

## Data flow

```text
Visitor -> Next.js public route /[slug]
       -> published tenant + available catalog + active offers (Supabase RLS)
       -> wa.me order / consultation link
       -> OneSignal Web Push subscription

Merchant -> Next.js /dashboard (cookie-based Supabase Auth)
         -> tenant_members membership and role
         -> products_services + offers
         -> WhatsApp instance lifecycle and integration metadata

Next.js server APIs -> Supabase (service role only for trusted server operations)
                    -> Evolution API (QR, messages, connection events)
                    -> OneSignal REST
                    -> Meta Graph API / webhooks
                    -> Google Business Profile API
                    -> n8n authenticated webhook
                    -> integration_events (idempotency, retries, status)
```

## Tenant isolation

- Every business-owned record carries a `tenant_id`.
- `tenant_members` is the authorization source; user-editable profile metadata is never used for roles.
- Public access is limited to published tenants, available catalog entries and currently published offers.
- Authenticated writes require owner/admin/editor membership; sensitive integration metadata requires owner/admin.
- OAuth credentials live in the unexposed `private.social_credentials` schema as encrypted ciphertext. The browser never receives access or refresh tokens.
- WhatsApp and integration state is written by trusted server-side workers, not arbitrary browser clients.
- `private.create_tenant` creates the tenant and owner membership atomically.

## Launch sequence

1. Apply the SQL migration to a non-production Supabase environment.
2. Run Supabase security/performance advisors; verify RLS with two users in two tenants.
3. Connect Next.js Auth using cookie-based SSR. Never expose the service-role key.
4. Implement public slug resolution and merchant dashboard.
5. Add idempotent integration events and authenticated n8n callbacks.
6. Configure Evolution, OneSignal, Meta and Google credentials only in server-side environments.
7. Verify Preview, browser flows and mobile/iOS push installation before enabling integrations.

## Current environment constraint

The linked Supabase project `smartbarrio` was inspected on 2026-11-22 and reported `INACTIVE`. This migration is committed as code only; it has not been applied. Do not run migrations or database writes until the project is restored and reports `ACTIVE_HEALTHY`.

## Decisions

- Retain Next.js 15 App Router; the existing PMV already uses it.
- Supabase is the SaaS source of truth. VPS PostgreSQL is reserved for n8n and Evolution internal state.
- The first release operates with WhatsApp Simple even if Evolution is unavailable.
- External channel operations are asynchronous and idempotent; the offer record remains authoritative.
