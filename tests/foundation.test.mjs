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
