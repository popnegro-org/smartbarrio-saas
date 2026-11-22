# n8n workflows

Import the JSON files in the n8n editor. Both workflows are intentionally inactive.

## Required environment

- `APP_BASE_URL`: public Next.js origin.
- `AUTOMATION_SECRET`: random secret shared only by Next.js and n8n.
- `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`: OneSignal server credentials.

The Compose service passes these values into n8n. Do not store credentials in exported workflow JSON.

## Webhook contracts

### Offer
POST `/webhook/smartbarrio/offers`

Headers: `x-automation-secret`

Body:
```json
{ "tenantId": "uuid", "offerId": "uuid", "eventId": "uuid-or-idempotency-key" }
```

The internal offer lookup must return `id`, `tenantId`, `slug`, `title`, and optional `description`. The workflow dispatches push, WhatsApp Status and Google Business operations. Internal handlers must treat each event idempotently and return a skipped result when a channel is disabled or disconnected.

### Incoming message
POST `/webhook/smartbarrio/inbound-message`

Headers: `x-automation-secret`

Body:
```json
{
  "tenantId": "uuid",
  "channel": "whatsapp",
  "sender": "5492610000000",
  "message": "¿Qué horario tienen?",
  "providerMessageId": "provider-message-id",
  "instanceName": "optional-evolution-instance"
}
```

For Instagram, set `channel` to `instagram` and `sender` to the Instagram-scoped sender ID. The internal reply handlers enforce channel matching and deduplicate by `providerMessageId`.

## Important

The internal Next.js routes referenced by these workflows are implemented in subsequent application changes. Do not activate either workflow until those routes exist, their authentication is verified, and provider credentials are configured. The WhatsApp Status API endpoint is delegated to the Evolution adapter to avoid hard-coding an unverified Evolution version-specific route.
