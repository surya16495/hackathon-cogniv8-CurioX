# CurioX

A learning companion that gets to know you, then explains anything in the way that works for you: with live, cited research, one-tap learn actions and quick quizzes. It installs on any phone as a PWA, and no login is needed.

## Overview

| Part | Stack | Folder |
| --- | --- | --- |
| API | Node 24 LTS, Express 5, TypeScript, MongoDB Atlas (Mongoose) | `server/` |
| Web + mobile | React, Vite, Tailwind CSS, installable PWA | `web/` |
| Shared contract | TypeScript types + zod schemas | `packages/shared/` |
| Native app (stretch) | Expo | `mobile/` |

AI: Gemini 3.8 Flash (answers) and 3.5 Flash-Lite (routing, extraction, quiz), with Groq `gpt-oss-120b` as the fallback and labelled demo answers as the last resort. Search: Tavily. More detail is in [docs/architecture.md](docs/architecture.md) and [docs/api-contract.md](docs/api-contract.md).

## Business case

See [docs/business-case.md](docs/business-case.md).

## Key features

- **Conversational onboarding**: six questions build a learner profile (interests, levels, goals, explanation style, tone, curiosities).
- **Personalized, streamed answers** that adapt to the profile and conversation.
- **Research with sources**: current-events questions trigger a live web search, with numbered, clickable citations.
- **Learn actions**: Simplify, Go deeper, Real-world example, Challenge me, Compare perspectives.
- **Quiz**: multiple-choice questions on whatever you just discussed.
- **Always answers**: if Gemini is rate-limited it switches to Groq, and if both are down it gives a clearly labelled demo answer.

## Deployment and local development

Requires **Node 24** (`nvm use`, which reads `.nvmrc`).

```bash
npm install
cp .env.example server/.env     # fill in MONGODB_URI and keys (or set DEMO_MODE=true)
npm run dev:server              # API on http://localhost:4000
npm run dev:web                 # web on http://localhost:5173 (also on your Wi-Fi IP, for phones)
npm run check-keys -w server    # verify Gemini, Groq and Tavily keys
npm test                        # server tests (in-memory MongoDB, no API quota used)
npm run smoke                   # judge journey against the running API
```

In development the web app calls `/api` on its own origin and Vite proxies it to port 4000, so there's no CORS setup and a phone on the same Wi-Fi can open `http://<laptop-ip>:5173` directly. To install it as an app on a phone, use the hosted HTTPS URL (PWAs need HTTPS).

Hosted: the API runs on a Render free web service (build `npm install && npm run build -w server`, start `npm start -w server`, set the env vars from `.env.example`). The web app is a static site on Vercel or Netlify (build `npm run build -w web`, output `web/dist`, set `VITE_API_URL` to the Render URL and add the site's URL to the API's `CORS_ORIGIN`; `web/vercel.json` and `web/public/_redirects` handle page refreshes on `/profile`). The database is MongoDB Atlas M0, using `curiox_dev` and `curiox_prod`.

## Team

Team cogniv8. <!-- names and lanes -->
