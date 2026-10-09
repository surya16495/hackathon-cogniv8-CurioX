# CurioX

A learning companion that gets to know you, then explains anything in the way that works for you: with live, cited research, one-tap learn actions, quick quizzes, and a full **voice mode**, so you can do everything hands-free. No login needed.

## Overview

| Part | Stack | Folder |
| --- | --- | --- |
| **Mobile app (primary)** | Expo SDK 57, React Native, Expo Router, TypeScript | `mobile/` |
| API | Node 24 LTS, Express 5, TypeScript, MongoDB Atlas (Mongoose) | `server/` |
| Shared contract + voice parser | TypeScript types, zod schemas, voice command parser | `packages/shared/` |

AI: Groq `gpt-oss-120b` first (fast on the free tier), Gemini 3.8 Flash / 3.5 Flash-Lite as the fallback (`LLM_CHAT_ORDER`), and labelled demo answers and a demo issue as the last resort. Search: Tavily. Voice transcription: Groq Whisper. More detail is in [docs/architecture.md](docs/architecture.md) and [docs/api-contract.md](docs/api-contract.md).

## Business case

See [docs/business-case.md](docs/business-case.md).

## Key features

- **A daily issue, made for you**: every day CurioX searches the news for what you follow and writes a nine-card lead deck (hook, what happened, why it matters to you, myth or fact, explain it three ways, this vs that, guess the number, watch it, finale) plus a short deck per interest. Swipe through, then take the quiz, teach it back, read the sources, or listen.
- **Reader card onboarding**: six chip questions; questions 2 to 6 follow the interests you pick in question 1.
- **Talk mode**, the only place CurioX speaks and listens: open the Talk tab and it says hello, tells you what's new today and asks what you want to learn about, explains it, asks your view, explains the impact, asks what you make of it, then chats until you say "that's all". Pick the voice: Friendly, Casual or Playful. When you wrap up it keeps the key points, scores how keen you were, and a topic you cared about joins your interests, with a fresh story on Home when there is news on it.
- **Pinboard**: pin sources and videos from any deck for a deeper read.
- **Personalized, streamed answers** that adapt to the profile and the conversation, and can be turned into cards.
- **Research with sources**: current-events questions trigger a live web search, with numbered, tappable citations.
- **Learn actions**: Simplify, Go deeper, Real-world example, Challenge me, Compare perspectives.
- **Quiz**: multiple-choice questions on whatever you just discussed.
- **Always answers**: if Gemini is rate-limited it switches to Groq, and if both are down it gives a clearly labelled demo answer.

## Running it

Requires **Node 24** (`nvm use`, which reads `.nvmrc`) and the **Expo Go** app on your phone (App Store / Play Store).

```bash
npm install
cp .env.example server/.env     # fill in MONGODB_URI and keys (or set DEMO_MODE=true)
npm run dev:server              # terminal 1: API on port 4000
npm run dev:mobile              # terminal 2: Expo; scan the QR code with Expo Go
```

- Your phone must be on the **same Wi-Fi** as the laptop. The app finds the API on the laptop's IP automatically. To point it elsewhere, set `EXPO_PUBLIC_API_URL` in `mobile/.env`.
- Voice input needs the server's `GROQ_API_KEY` (speech is transcribed by Groq Whisper, which also works with `DEMO_MODE=true`). On iPhone, voice replies are silent while the ring/silent switch is on silent.
- Checks: `npm test` (shared voice parser + server), `npm run typecheck`, `cd mobile && npx expo-doctor`, `npm run check-keys -w server`, `npm run smoke`.
- **Artwork** (`mobile/assets/art`, `mobile/assets/paper`, the app icons) is rendered from Twemoji by `mobile/scripts/build-art.mjs` and `build-icons.mjs` (needs Playwright with Chromium: `PLAYWRIGHT=/path/to/node_modules/playwright node scripts/build-art.mjs`). Re-run `build-art.mjs` after adding a key to `packages/shared/src/art.ts`. Sticker artwork: Twemoji, CC BY 4.0.

## Deployment

Step by step in [docs/DEPLOY.md](docs/DEPLOY.md). In short: the API runs on Render from the `render.yaml` blueprint (secrets entered in the dashboard), the database is MongoDB Atlas, and the Android app is an APK built with `npx eas-cli@latest build --platform android --profile preview` from `mobile/` (the API URL is set in `mobile/eas.json`). iPhones use Expo Go.

## Team

Team cogniv8, Apty Hackathon 2026.

| Name | Lane |
| --- | --- |
| Surya | Product, mobile app, backend |
| _add teammate_ | _lane_ |

<!-- Replace the rows above with the team's names and what each person owned. -->
