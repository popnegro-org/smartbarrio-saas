# SmartBarrio — implementación y estado de validación

## Alcance implementado

SmartBarrio es un PMV SaaS multitenant para comercios de barrio en Argentina.

- Next.js App Router, TypeScript y Tailwind.
- Supabase Auth, PostgreSQL, políticas RLS y Storage con bucket público tenant-assets y carga de logos restringida por tenant.
- Supabase Edge Function dispatch-offer con autenticación de servidor e idempotencia; activación opcional mediante SUPABASE_FUNCTIONS_ENABLED.
- Registro, onboarding, alta/publicación de comercios y selector de tenant.
- Dashboard para perfil comercial, catálogo, ofertas e integraciones.
- Landing pública por slug, SEO local, JSON-LD LocalBusiness, horarios, carrito y pedidos por WhatsApp.
- Manifiesto PWA dinámico por comercio para que la instalación abra la landing correcta.
- Gestión de horarios por día y sincronización con Google Business Profile; fallback de copiar/publicar.
- PWA con manifest, icono e instrucciones de instalación para iOS.
- OneSignal Web Push segmentado por tenant_id.
- Evolution API: instancia por comercio, QR, webhooks y envío de mensajes/Estados.
- Meta OAuth, suscripción de webhooks y respuestas de Instagram Messaging.
- Google OAuth, Local Posts y fallback de copiar/publicar.
- Workflows n8n exportables y desactivados por defecto.
- Docker Compose para PostgreSQL, Redis, n8n, Evolution API y Caddy.

## Comandos de verificación

Requiere Node.js 22 o superior.

    npm ci
    npm run lint
    npm run typecheck
    npm test
    npm run build
    npm audit --audit-level=high

El workflow Browser QA ejecuta lint, typecheck, pruebas unitarias, validación Docker Compose, Playwright funcional y accesibilidad. También valida la Edge Function con Deno. Lighthouse CI y CodeQL se ejecutan sobre la rama candidata.

## Dependencias de seguridad

La rama fija las versiones compatibles y auditadas:

- Next.js 15.5.29
- React / React DOM 19.1.10
- PostCSS 8.5.33 mediante overrides

La automatización Patch framework security dependencies actualiza el lockfile, ejecuta auditoría, lint, typecheck, tests y build antes de publicar el commit en la rama candidata. No utiliza npm audit fix --force.

## Variables y servicios externos

Copiar .env.example y configurar los secretos reales en el entorno correspondiente. Nunca versionar .env.local ni .env.

Se requieren, como mínimo:

- Supabase URL, publishable key y service-role key.
- OneSignal App ID y REST API key.
- Evolution API URL y API key global.
- AUTOMATION_SECRET, EVOLUTION_WEBHOOK_SECRET y TOKEN_ENCRYPTION_KEY.
- Meta App ID/Secret, verify token y redirect URI.
- Google OAuth Client ID/Secret y redirect URI.
- URL pública de n8n para webhooks.

Los tokens OAuth y tokens por instancia de Evolution se cifran con AES-256-GCM. Las tablas social_credentials y whatsapp_credentials no conceden acceso a anon ni authenticated; solo service_role puede leerlas o modificarlas.

## n8n

Importar manualmente:

- n8n/workflows/offer-multichannel.json
- n8n/workflows/auto-reply-neighborhood.json

Los workflows quedan active=false. Configurar credenciales/variables, validar los webhooks y activar cada workflow desde n8n después de las pruebas de integración.

Después de restaurar y enlazar el proyecto Supabase, aplicar la migración y desplegar la función:

    supabase db push
    supabase secrets set AUTOMATION_SECRET=... N8N_WEBHOOK_BASE_URL=...
    supabase functions deploy dispatch-offer

Activar SUPABASE_FUNCTIONS_ENABLED=true en Vercel únicamente después de verificar la función. Si permanece false, Next.js envía directamente al webhook n8n.

## Estado de infraestructura

**No desplegar ni aplicar la migración hasta resolver estos bloqueos:**

1. El proyecto Supabase conectado (rpopiqeulnxbsclvvfuf) estaba INACTIVE. Se solicitó su restauración el 22/11/2026 y el último estado observado fue COMING_UP. No se aplicó la migración supabase/migrations/20261122170000_multitenant_saas.sql porque el proyecto todavía no figura ACTIVE_HEALTHY. La función Edge y el bucket Storage tampoco están desplegados.
2. En Vercel smartbarrio-saas se configuraron NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY únicamente para Preview y exclusivamente para feat/multitenant-saas-foundation. No se modificó Production. El deployment candidato del commit 9856f106a8fade5bf24d70a651cba30ed3496a12 fue creado y su último estado observado fue BUILDING. La configuración server-side SUPABASE_SERVICE_ROLE_KEY sigue pendiente.
3. OAuth de Meta y Google requiere credenciales reales, URLs de callback registradas, APIs habilitadas y permisos aprobados.
4. Evolution API y n8n requieren un VPS, DNS y secretos reales. No se ejecutaron conexiones QR ni mensajes reales.
5. OneSignal requiere una aplicación y dominios autorizados.
6. La sincronización de horarios/ofertas, mensajes WhatsApp e Instagram aún no se validó contra cuentas reales.

## Correcciones de seguridad y QA — 22/11/2026

- El middleware del dashboard ahora falla de forma cerrada con HTTP 503 si falta la configuración de Supabase o el proveedor de autenticación no responde; no permite continuar sin validar sesión.
- Se añadió una prueba de regresión para esta condición.
- Se corrigieron valores CSS de flex alignment (`start`/`end`) que producían advertencias de Autoprefixer.
- Browser QA: PASS (lint, Deno check, typecheck, unit tests, Docker Compose, build y Playwright funcional/accesibilidad).
- Lighthouse CI: PASS. CodeQL: PASS.
- Evidencia Browser QA: artifact del workflow run 45078586143.

## Seguridad de despliegue

- No exponer service-role keys, tokens OAuth ni tokens de Evolution en el navegador.
- No abrir los puertos de PostgreSQL o Redis en el VPS.
- Restringir Caddy a HTTPS y proteger el editor n8n con su autenticación de usuario.
- Importar los workflows inicialmente desactivados.
- No enviar mensajes, publicar ofertas reales ni ejecutar cambios en producción durante QA.

## Criterio de cierre

El PR permanece abierto y sin merge a main. El cierre requiere migración aplicada en Supabase activo, variables de entorno reales, Preview de Vercel, pruebas de integración con proveedores y revisión final del propietario.
