# External Integrations

**Analysis Date:** 2026-01-30

## APIs & External Services

**Error Reporting:**
- Sentry - Error capturing, breadcrumbs, context tagging
  - SDK/Client: \`@sentry/node\`, \`@sentry/browser\`, \`@sentry/nextjs\`
  - Auth: SENTRY_DSN (consumer-provided env var)

## Data Storage

**Databases:**
- Not applicable

**File Storage:**
- None

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None - Library is integration-agnostic

  - Implementation: Optional SentryReporter adapters

## Monitoring & Observability

**Error Tracking:**
- Sentry

**Logs:**
- \`console.error\` in \`src/utils/error-reporter.ts\`

## CI/CD & Deployment

**Hosting:**
- NPM registry

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars:**
- None in library core
- SENTRY_DSN required by consumers for Sentry integration

**Secrets location:**
- Consumer .env files

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None (Sentry SDK handles async reporting)

---

*Integration audit: 2026-01-30*