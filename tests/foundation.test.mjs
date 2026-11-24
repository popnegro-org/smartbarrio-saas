import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20261122170000_multitenant_saas.sql", "utf8");

test("multitenant migration defines required tenant resources", () => {
  for (const table of ["tenants", "tenant_members", "products_services", "offers", "whatsapp_instances", "push_subscribers", "social_integrations", "social_credentials", "whatsapp_credentials", "integration_events"]) {
    assert.match(migration, new RegExp("create table if not exists (public|private)\\." + table));
  }
});

test("tenant-owned public tables have RLS enabled", () => {
  for (const table of ["tenants", "tenant_members", "products_services", "offers", "whatsapp_instances", "push_subscribers", "social_integrations", "social_credentials", "whatsapp_credentials", "integration_events"]) {
    assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security"));
  }
  assert.match(migration, /private\.create_tenant/);
  assert.match(migration, /grant execute on function public\.create_tenant\(text,text,text\) to authenticated/);
});

test("n8n workflows are valid inactive imports with connected node references", () => {
  for (const file of ["n8n/workflows/offer-multichannel.json", "n8n/workflows/auto-reply-neighborhood.json"]) {
    const workflow = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(workflow.active, false);
    const names = new Set(workflow.nodes.map((node) => node.name));
    for (const [source, outputs] of Object.entries(workflow.connections)) {
      assert.ok(names.has(source), "missing source node " + source);
      for (const group of outputs.main ?? []) {
        for (const edge of group) assert.ok(names.has(edge.node), "missing target node " + edge.node);
      }
    }
  }
});

test("VPS infrastructure keeps PostgreSQL and Redis private", () => {
  const compose = fs.readFileSync("infra/docker-compose.yml", "utf8");
  assert.match(compose, /services:\s+postgres:/);
  assert.match(compose, /redis:/);
  assert.match(compose, /n8n:/);
  assert.match(compose, /evolution:/);
  assert.match(compose, /caddy:/);
  const postgresBlock = compose.split("  postgres:")[1].split("\n  redis:")[0];
  const redisBlock = compose.split("  redis:")[1].split("\n  n8n:")[0];
  assert.doesNotMatch(postgresBlock, /\n\s+ports:/);
  assert.doesNotMatch(redisBlock, /\n\s+ports:/);
});

test("Supabase Edge Function is configured as an authenticated server-to-server dispatcher", () => {
  const config = fs.readFileSync("supabase/config.toml", "utf8");
  const fn = fs.readFileSync("supabase/functions/dispatch-offer/index.ts", "utf8");
  assert.match(config, /\[functions\.dispatch-offer\]/);
  assert.match(config, /verify_jwt = false/);
  assert.match(fn, /AUTOMATION_SECRET/);
  assert.match(fn, /integration_events/);
  assert.match(fn, /N8N_WEBHOOK_BASE_URL/);
});

test("tenant storage is public-read but owner/admin-write only", () => {
  assert.match(migration, /insert into storage\.buckets/);
  assert.match(migration, /tenant_assets_public_read/);
  assert.match(migration, /tenant_assets_admin_insert/);
  assert.match(migration, /tenant_assets_admin_update/);
  assert.match(migration, /tenant_assets_admin_delete/);
});

test("merchant opening hours are persisted and formatted for automation", () => {
  const form = fs.readFileSync("app/dashboard/comercio/CommerceForm.tsx", "utf8");
  const helper = fs.readFileSync("lib/commerce/opening-hours.ts", "utf8");
  const internal = fs.readFileSync("app/api/internal/tenants/[id]/public-data/route.ts", "utf8");
  assert.match(form, /opening_hours: openingHours/);
  assert.match(helper, /formatOpeningHoursText/);
  assert.match(internal, /openingHoursText: hours/);
});

test("Google Business hours synchronization has a manual fallback", () => {
  const route = fs.readFileSync("app/api/integrations/google/sync-hours/route.ts", "utf8");
  assert.match(route, /mybusinessbusinessinformation\.googleapis\.com\/v1\/locations/);
  assert.match(route, /updateMask=regularHours/);
  assert.match(route, /mode: "manual"/);
  assert.match(route, /getGoogleAccessToken/);
});

test("each merchant PWA opens its own storefront", () => {
  const manifest = fs.readFileSync("app/[slug]/manifest.webmanifest/route.ts", "utf8");
  assert.match(manifest, /start_url: "\/" \+ slug/);
  assert.match(manifest, /scope: "\/"/);
});

test("dashboard authentication fails closed when Supabase is unavailable", () => {
  const middleware = fs.readFileSync("middleware.ts", "utf8");
  assert.match(middleware, /if \(!url \|\| !key\) return unavailable\(\)/);
  assert.match(middleware, /status: 503/);
  assert.match(middleware, /catch \{/);
  assert.match(middleware, /return unavailable\(\)/);
  assert.match(middleware, /httpOnly: true/);
});


test("email validation uses bounded string operations and rejects malformed input", async () => {
  const { isValidEmailAddress } = await import("../lib/security/email-validation.ts");
  for (const address of ["owner@example.com", "first.last+tag@example.co.ar"]) {
    assert.equal(isValidEmailAddress(address), true, address);
  }
  for (const address of ["", "plain-address", "@example.com", "owner@", "owner@example", "owner..name@example.com", ".owner@example.com", "owner@example..com", "a".repeat(255) + "@example.com", "owner!@!.".repeat(1000) + "@example.com"]) {
    assert.equal(isValidEmailAddress(address), false, "rejected: " + address.slice(0, 80));
  }
});

test("Instagram failed retries are claimed with a conditional atomic transition", () => {
  const route = fs.readFileSync("app/api/internal/integrations/instagram/reply/route.ts", "utf8");
  assert.match(route, /status=eq\.failed&select=id,status,attempts/);
  assert.match(route, /if \(!updated\[0\]\)/);
  assert.match(route, /Only one concurrent delivery can/);
});

test("Google OAuth never silently selects the first managed business location", () => {
  const route = fs.readFileSync("app/api/integrations/google/callback/route.ts", "utf8");
  assert.match(route, /candidates\.length !== 1/);
  assert.match(route, /multiple_locations/);
  assert.match(route, /nextPageToken/);
  assert.doesNotMatch(route, /location = locations\[0\]/);
});

