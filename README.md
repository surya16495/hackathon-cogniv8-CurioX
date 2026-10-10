# CurioX

**Your curiosity, in cards.** CurioX is a personalised AI learning companion for the phone. It learns what you are into, then turns today's news on those topics and anything you ask into short swipeable card decks, with a quiz, a teach-back, cited sources and a spoken summary on every deck. Its Talk mode is a real conversation: CurioX says hello, tells you what is new, explains what you pick, asks what you think, and remembers what you cared about.

Built by **Team cogniv8** for the Apty Hackathon 2026.

## The idea

Most people want to keep learning but bounce off long articles, generic feeds and courses that do not know them. CurioX flips that around:

- **It gets to know you first.** A one-minute chip interview (interests, how much you know about each, why you learn, how you like things explained, what tone you like). Every question after the first is written by the model for the topics you picked.
- **It writes you a daily issue.** Each day it searches the news for what you follow, picks the lead, and writes a nine-card deck (hook, what happened, why it matters to you, myth or fact, three ways to explain it, this vs that, guess the number, watch it, finale) plus short decks for the other topics. Card types are chosen by the content: a number becomes a guess, a misconception a myth card, a comparison a versus card.
- **It learns from what you do.** Reading, asking and talking about a topic score it; a few signals make it an interest, and your issue follows. A brand-new reader gets today's top stories plus picks from their answers until CurioX knows them.
- **It talks.** Talk mode is spoken both ways: a greeting with today's updates, an explanation of what you choose, your view, the impact, and a wrap-up that keeps the key points as cards and pushes new stories on that topic to your phone.

## Use case

| Who | The problem today | With CurioX |
| --- | --- | --- |
| A busy professional who wants to stay sharp on AI, markets or their field | Newsletters pile up unread; feeds are noise; nothing adapts to what they already know | A three-minute daily issue on exactly their topics, pitched at their level, with a quiz to make it stick |
| A student with an exam or an interview coming | Textbooks are long, tutors are expensive, chatbots give walls of text | Ask anything and get cards, not prose; teach it back and get marked; "explain it three ways" when it does not land |
| A curious person who learns by talking | Reading is tiring after a long day; voice assistants answer one question and stop | A hands-free conversation that explains, asks their view, follows up, and keeps notes |
| Someone new to a subject | Does not know what to ask | Today's top stories, picks from their answers, and a Talk that proposes what to learn |

## Impact

- **Time to learning:** the daily issue is about three minutes of cards instead of thirty minutes of articles, and every deck ends with a quiz and a teach-back, so the time spent turns into retention.
- **Accessibility:** everything works by voice in Talk, with a headset button that reads any deck aloud while turning the cards. Reduced-motion is respected throughout.
- **Trust:** every news card carries its source, cards can be checked against numbered citations, and the model never invents URLs; sources only come from live search.
- **Cost to run:** the whole stack runs on free tiers today (Render, MongoDB Atlas M0, Groq and Gemini free quotas, Tavily free plan, Expo). Several API keys per provider rotate automatically when one is rate-limited, and a labelled demo mode keeps the app usable if every model is down.
- **Grows with the reader:** interests, levels per topic, read history, pins and talk summaries all persist per account across phones.

## Tech stack

| Part | Stack | Folder |
| --- | --- | --- |
| Mobile app (primary client) | Expo SDK 57, React Native, Expo Router, TypeScript, react-native-svg, expo-speech, expo-audio, expo-notifications, expo-image-picker | `mobile/` |
| API | Node 24, Express 5, TypeScript, Mongoose 8 (MongoDB Atlas), zod, Server-Sent Events for streamed answers | `server/` |
| Shared contract | TypeScript types, zod schemas, reader-card logic, voice command grammar | `packages/shared/` |
| Models | Groq `openai/gpt-oss-120b` first, Gemini 3.8 Flash and 3.5 Flash-Lite as fallback, labelled demo answers last | `server/src/services/llm` |
| Search | Tavily news search, cached in Mongo for six hours | `server/src/services/search` |
| Voice | Device text-to-speech (expo-speech); speech-to-text in the browser's recogniser on web and Groq Whisper on phones | `mobile/src/voice` |
| Notifications | Local notification for today's issue; Expo push (through Firebase Cloud Messaging on Android) for updates on followed topics | `server/src/services/push`, `mobile/src/lib/notify.ts` |
| Accounts | scrypt password hashes, HMAC bearer tokens, per-device anonymous users that an account can claim | `server/src/services/auth.ts` |
| Hosting | Render (API, `render.yaml` blueprint), MongoDB Atlas, EAS Build (Android APK), Expo Go (iPhone) | `docs/DEPLOY.md` |
| Tests | vitest with an in-memory MongoDB and fake providers (server, 160 tests; shared, 177 tests); Playwright journeys against the Expo web build | `server/tests`, `packages/shared/src/*.test.ts` |

How a request flows through the server, and the design rules, are in [docs/architecture.md](docs/architecture.md). The HTTP contract is in [docs/api-contract.md](docs/api-contract.md).

## Resources used

- **Groq** (free tier): fast answers, issue writing, talk turns, Whisper speech-to-text.
- **Google Gemini API** (free tier): fallback model.
- **Tavily**: news and web search with snippets.
- **MongoDB Atlas** M0: users, conversations, issues, decks, pins, talk sessions, search cache.
- **Render** free web service: the API. **Expo EAS** free builds: the Android APK. **Firebase Cloud Messaging**: Android push delivery.
- **Expo SDK and libraries**: expo-router, expo-speech, expo-audio, expo-notifications, expo-image-picker, expo-image-manipulator, react-native-svg, react-native-webview, react-native-youtube-iframe.
- **Fonts**: Gabarito, Atkinson Hyperlegible, Courier Prime, Reenie Beanie (Google Fonts, through expo-google-fonts).
- **Artwork**: halftone cut-outs and stickers rendered from Twemoji (CC BY 4.0) by `mobile/scripts/build-art.mjs`; paper textures and the app icon are generated in the repo.
- **Design**: the paper-zine look (yellow panels, pen marks, cut-outs) follows the team's mobile prototype.

## Repository layout

```
mobile/            Expo app: src/app (routes), src/screens, src/deck (cards), src/voice, src/ui (design kit)
server/            Express API: src/routes, src/services, src/prompts, src/db/models, tests/
packages/shared/   Types, schemas and logic shared by app and API
docs/              architecture.md, api-contract.md, DEPLOY.md, PROJECT_IDEA.md, business-case.md
render.yaml        Render blueprint for the API
.env.example       Every environment variable, with comments
```

## Run it locally

You need **Node 24** (via nvm), **npm 10+**, a free **MongoDB Atlas** cluster (or a local MongoDB), and the **Expo Go** app on your phone. API keys are optional: with `DEMO_MODE=true` the app runs on canned content.

```bash
# 1. Clone and install (one install for all three workspaces)
git clone https://github.com/surya16495/hackathon-cogniv8-CurioX.git
cd hackathon-cogniv8-CurioX
nvm install 24 && nvm use 24
npm install

# 2. Configure the API
cp .env.example server/.env
#    Edit server/.env: set MONGODB_URI, and GROQ_API_KEY / GEMINI_API_KEY / TAVILY_API_KEY
#    (comma-separate several keys per provider, or use GROQ_API_KEY_2 …). Set AUTH_SECRET to any long random string.
#    No keys yet? Set DEMO_MODE=true.

# 3. Check the keys and the database
npm run check-keys -w server      # tries every key
npm run dev:server                # terminal 1: API on http://localhost:4000 (open /api/health)

# 4. Run the app
npm run dev:mobile                # terminal 2: Expo; scan the QR code with Expo Go
#    Phone and laptop on the same Wi-Fi: the app finds the API on the laptop's IP by itself.
#    To use a hosted API instead, put EXPO_PUBLIC_API_URL=https://… in mobile/.env.

# 5. Tests and checks
npm test                          # shared + server (in-memory MongoDB, fake models: costs no quota)
npm run typecheck                 # all three workspaces
cd mobile && npx expo-doctor      # Expo project health
npm run smoke                     # the judge journey against a running server (API_URL=… for a hosted one)
```

Notes: voice input on phones needs the server's `GROQ_API_KEY` (Whisper). On iPhone, spoken replies are silent while the ring switch is on silent. Push notifications need the installed Android build, not Expo Go. The artwork is pre-rendered; re-run `mobile/scripts/build-art.mjs` (needs Playwright) only after adding keys to `packages/shared/src/art.ts`.

## Deployment

The full, click-by-click guide is [docs/DEPLOY.md](docs/DEPLOY.md). The commands:

```bash
# API on Render: New + → Blueprint → this repo. render.yaml creates the service; paste the secrets
# (MONGODB_URI, GROQ_API_KEY, GEMINI_API_KEY, TAVILY_API_KEY, optional *_2 keys) in the dashboard.
# Every push to main redeploys. Health check:
curl https://curiox-api.onrender.com/api/health

# Android APK with EAS (free Expo account). The hosted API URL is baked in by mobile/eas.json.
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure                         # first time only: links the EAS project
npx eas-cli@latest build --platform android --profile preview
#   → install from the build page's QR code. Push on Android also needs the Firebase key uploaded
#     under Credentials on expo.dev (DEPLOY.md, section 6).

# iPhone: Expo Go against the hosted API
echo 'EXPO_PUBLIC_API_URL=https://curiox-api.onrender.com' > mobile/.env
npm run dev:mobile
```

## Team

Team cogniv8, Apty Hackathon 2026.

| Name | Lane |
| --- | --- |
| Surya | Product, mobile app, backend |
| _add teammate_ | _lane_ |

Sticker artwork: Twemoji, CC BY 4.0.
