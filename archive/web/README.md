# CurioX web app (archived)

**Status: paused on 9 Oct 2026.** The team chose to ship the Expo mobile app (`mobile/`) as the primary client. This folder keeps the React + Vite PWA so it can be revived later. It is **not** an npm workspace: it isn't installed, built, tested or deployed.

## What works

- Onboarding, streamed chat with sources and citations, learn actions, quiz, and profile, all verified end to end with Playwright on 9 Oct (light and dark, real models and demo mode).

## Work in progress

- **Voice mode** (`src/voice/`) was mid-build when the web app was paused. The parser and speech helpers are unit-tested, but the browser voice journey was never run to completion here. The finished, tested version lives in `mobile/src/voice/`, with the shared parser in `packages/shared/src/voice/`. Port from there rather than finishing this copy.

## Reviving it

1. Move this folder back to `web/` and add `"web"` to the root `workspaces`.
2. Replace `src/voice/commands.ts` and `speakable.ts` with imports from `@curiox/shared`.
3. `npm install`, then `npm run dev -w web` (Vite proxies `/api` to port 4000; set `API_PROXY_TARGET` to change it).
