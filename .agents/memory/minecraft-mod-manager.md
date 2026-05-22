---
name: Minecraft Mod Manager
description: Architecture decisions and gotchas for the mod manager project
---

# Minecraft Mod Manager — Key Decisions

## Python downloader config
- `GAME_VERSION`, `MOD_LOADER`, `DOWNLOAD_TYPE` env vars control behavior (not CLI flags)
- `downloads/.index.json` tracks slug→filename for older-version detection
- CurseForge URLs automatically search Modrinth first; fall back to CF CDN only if not found

## API download flow
- `POST /api/download` returns `{ jobId }` immediately, spawns Python async
- `GET /api/download/:jobId` is polled by client; returns `{ status, lines, done }`
- Jobs live in-memory (cleaned up after 5 min)

## Auth system
- bcryptjs (cost 12) for password hashing
- Session tokens: `crypto.randomBytes(32).toString("hex")` stored in `sessions` table
- 30-day session expiry
- `requireAuth` middleware in `artifacts/api-server/src/routes/auth.ts`

## DB tables
- `users`, `sessions`, `backups` in `lib/db/src/schema/`

## Expo app
- expo-secure-store pinned to ~15.0.8 (v56+ incompatible with current Expo)
- Auth token stored in SecureStore (web fallback: localStorage)
- `EXPO_PUBLIC_DOMAIN` env var used for API base URL — set by Replit workflow system
- Tab structure: Download → Library → Backups → Account
- Dark Minecraft theme: primary `#4ade80` (grass green), background `#0e0e10`

**Why:** Async job polling chosen over SSE because React Native has no native EventSource.
