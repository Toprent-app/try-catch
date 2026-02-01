# Technology Stack

**Analysis Date:** 2026-01-30

## Languages

**Primary:**
- TypeScript ^5.9.3 - All source code in \`src/\`

**Secondary:**
- JavaScript - Built outputs in \`dist/\`

## Runtime

**Environment:**
- Node.js >=20 - \`package.json\` engines field

**Package Manager:**
- npm
- Lockfile: present (\`package-lock.json\`)

## Frameworks

**Core:**
- None - Standalone TypeScript utility library

**Testing:**
- vitest ^4.0.3 - \`vite.config.ts\`, \`npm test\`

**Build/Dev:**
- tsup ^8.5.0 - \`tsup.config.ts\`, \`npm run build\`

## Key Dependencies

**Critical:**
- None - Zero production dependencies

**Infrastructure:**
- Sentry SDKs (\`@sentry/node\`, \`@sentry/browser\`, \`@sentry/nextjs\`) ^8.x <11 - Externalized in \`tsup.config.ts\`, used in adapters

## Configuration

**Environment:**
- No .env files detected
- Minimal env usage (e.g., \`process.env.NODE_ENV\` in comments only \`src/core/Try.ts\`)

**Build:**
- \`tsconfig.json\` (CJS target ES2022)
- \`tsconfig.esm.json\` (ESM target ES2020)
- \`tsup.config.ts\` (CJS/ESM dual builds)

## Platform Requirements

**Development:**
- Node.js >=20
- \`npm install\`
- \`npm run build\`
- \`npm test\`

**Production:**
- NPM package
- Consumers install and configure Sentry

---

*Stack analysis: 2026-01-30*