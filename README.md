# CurioX

A learning companion that gets to know you, then explains anything in the way that works for you: with live, cited research, one-tap learn actions, quick quizzes, and a full **voice mode**, so you can do everything hands-free. No login needed.

## Overview

| Part | Stack | Folder |
| --- | --- | --- |
| **Mobile app (primary)** | Expo SDK 57, React Native, Expo Router, TypeScript | `mobile/` |
| API | Node 24 LTS, Express 5, TypeScript, MongoDB Atlas (Mongoose) | `server/` |
| Shared contract + voice parser | TypeScript types, zod schemas, voice command parser | `packages/shared/` |
| Web app (paused) | React, Vite, Tailwind, PWA | `archive/web/` (see its README) |

AI: Gemini 3.8 Flash (answers) and 3.5 Flash-Lite (routing, extraction, quiz), with Groq `gpt-oss-120b` as the fallback and labelled demo answers as the last resort. Search: Tavily. Voice transcription: Groq Whisper. More detail is in [docs/architecture.md](docs/architecture.md) and [docs/api-contract.md](docs/api-contract.md).

## Business case

See [docs/business-case.md](docs/business-case.md).

## Key features

- **Conversational onboarding**: six questions build a learner profile (interests, levels, goals, explanation style, tone, curiosities).
- **Personalized, streamed answers** that adapt to the profile and the conversation.
- **Research with sources**: current-events questions trigger a live web search, with numbered, tappable citations.
- **Learn actions**: Simplify, Go deeper, Real-world example, Challenge me, Compare perspectives.
- **Quiz**: multiple-choice questions on whatever you just discussed.
- **Voice mode on every screen**: CurioX reads questions, answers, quizzes and results aloud, then listens. Answer onboarding, ask questions, say "simplify" or "quiz me", answer quizzes ("B", "the first one"), edit your profile ("add interest chess"), and navigate, all by voice. Say "help" for the commands on any screen.
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

## Deployment

- **API**: Render free web service (build `npm install && npm run build -w server`, start `npm start -w server`, env vars from `.env.example`).
- **Android APK**: `cd mobile && npx eas-cli@latest build --platform android --profile preview` (needs a free Expo account; set `EXPO_PUBLIC_API_URL` to the Render URL). The free EAS queue can take over an hour, so start early.
- **iPhone**: judges use Expo Go, or an installable build with an Apple Developer account.
- Database: MongoDB Atlas M0 (`curiox_dev`, `curiox_prod`).

## Team

Team cogniv8. <!-- names and lanes -->
