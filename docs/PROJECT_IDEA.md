# CurioX architecture plan

Oct 9, 2026 · @Surya

Build CurioX as one Express + MongoDB API that serves a React web app installable on phones as a PWA. Use Gemini 3.8 Flash on the free tier, Groq as the fallback model and Tavily for search. A native Expo app on the same API is a stretch goal, not part of the core demo.

## Tech stack

MERN is the right call here: a standalone Express API is what lets a web app and a mobile app share one backend. This changes section 7 of the CurioX spec, which names Next.js API routes and Supabase. Update that line so coding agents do not follow the old instruction.

| Layer | Choice | Why |
| --- | --- | --- |
| API | Node LTS, Express, TypeScript | The team's stack; one API for every client |
| Database | MongoDB Atlas M0 (free) with Mongoose | Profiles and chat history are documents; no migrations overnight |
| Web | React, Vite, Tailwind CSS | The spec's design stack without Next.js; a static build deploys anywhere |
| Mobile, core demo | The same web app as an installable PWA | Installs from the browser on Android and iOS with no second codebase |
| Mobile, stretch | Expo (React Native) app on the same API | A real Android APK if the core journey is finished early |
| Streaming | Server-Sent Events over `fetch` | Token-by-token replies without WebSockets |
| Identity | Anonymous device ID sent in a header | No login, so a judge can use it unaided; the profile still persists |
| Shared code | npm workspaces with a `packages/shared` types package | One request/response contract for server, web and mobile |

### Options for web + mobile

| Option | Web | Mobile | Cost in a 24-hour build | Verdict |
| --- | --- | --- | --- | --- |
| MERN + PWA | React (Vite) | Installable PWA | One frontend codebase | Recommended |
| MERN + Expo app | React (Vite) | React Native via Expo | A second client to build and test; reuses the API and types | Stretch, only after the web journey works end to end |
| Expo universal | React Native for Web | Native iOS and Android | One codebase for all three, but Tailwind becomes NativeWind and web polish is slower | The best 12-month answer; risky tonight unless the team has shipped React Native |
| Next.js full-stack (the spec's original) | Next.js on Vercel | PWA, or Expo calling its API routes | Fastest for web only, one deploy | Only if you drop the native app |

About 22 hours remain before the Saturday 12:00 PM freeze, and the working demo carries 30% of the score. That is why the native app is a stretch goal: a polished PWA a judge can open on a phone beats a half-finished APK.

## Architecture

Every client talks only to the Express API. The Gemini, Groq and Tavily keys live on the server and never reach the browser or the app.

&#91;embedded content: architecture · 2 clients, 1 API, 4 outside services\]

The dashed box is the stretch mobile app; it uses the same routes as the web app.

### How one chat message is handled

1. The client posts the message, an optional learn action and its device ID to `POST /api/chat`.
2. The API loads the user's profile and the last 10 messages from MongoDB.
3. A small Flash-Lite call returns JSON: does this need current information, and with what search query?
4. If yes, the API runs one Tavily basic search for 5 results and keeps each title, URL and snippet. Results are cached by query for 6 hours.
5. The prompt is assembled from the CurioX persona, the profile summary, the history, the numbered sources and the action instruction.
6. Gemini 3.8 Flash streams the answer. The API relays it as SSE events: `status`, `token`, `sources`, `done`, `error`.
7. On a 429 or 5xx from Gemini, the same prompt goes to Groq. If both fail, the API returns a clearly labelled demo answer.
8. Both messages, the sources and the provider used are saved.

The profile is a few hundred tokens, so it goes straight into the system prompt. No embeddings or vector database are needed.

### API routes

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Wake-up and uptime check |
| `POST /api/session` | Create or load the user for a device ID; returns the profile and onboarding status |
| `POST /api/onboarding/message` | One onboarding turn: stores the answer, returns the next question or the finished profile; accepts `skip` |
| `GET`, `PUT`, `DELETE /api/profile` | Review, edit or clear the saved profile |
| `GET /api/topics/suggested` | 4 to 6 starter topics from the profile's interests |
| `POST /api/chat` | Streamed reply over SSE; `stream=false` returns one JSON body for a client that cannot stream |
| `GET /api/conversations/:id/messages` | Reload history after a refresh |
| `POST /api/learn/quiz` | 3 to 5 multiple-choice questions as structured JSON for the current topic |

Learn actions (simplify, go deeper, real-world example, challenge me, compare perspectives) are not separate routes. Each is an `action` value on `POST /api/chat` that adds one instruction to the prompt.

### Data model

| Collection | Fields |
| --- | --- |
| `users` | `deviceId`, `profile` (interests, knowledgeLevels, goals, explanationStyle, tone, curiosities), `onboarding` (status, step), timestamps |
| `conversations` | `userId`, `title`, timestamps |
| `messages` | `conversationId`, `role`, `content`, `sources[]`, `action`, `provider`, `createdAt` |
| `searchCache` | `queryHash`, `results`, `createdAt` with a 6-hour TTL index |

### Two design choices that protect the demo

- **Onboarding is server-driven.** The server owns the six things to learn and a step counter; the model only phrases the next question from what is already known. After the last step, one Flash-Lite call extracts the profile as JSON. It reads like a conversation but cannot wander.
- **The quiz is the interactive learning feature.** It works for whatever topic a judge picks and needs one structured-output call. Add a topic-specific simulation only if time is left.

## AI models and search

Everything below is free and needs no card. Keep model IDs in environment variables so swapping one is a config change, not a code change.

| Job | Provider and model | Free-tier facts |
| --- | --- | --- |
| Chat, research synthesis, learn actions | Google [`gemini-3.8-flash`](https://ai.google.dev/gemini-api/docs/pricing) | Input and output free of charge; the newest Flash model, released 2 September 2026 |
| Router, profile extraction, quiz JSON, suggested topics | Google [`gemini-3.5-flash-lite`](https://ai.google.dev/gemini-api/docs/pricing) | Free of charge; the lighter model Google recommends for new projects |
| Fallback when Gemini is rate-limited or down | Groq [`openai/gpt-oss-120b`](https://console.groq.com/docs/rate-limits) | 30 requests/min, 1,000 requests/day, 8,000 tokens/min, 200,000 tokens/day |
| Web search | [Tavily](https://docs.tavily.com/documentation/api-credits), basic depth | 1,000 credits a month; a basic search costs 1 credit, an advanced search 2 |
| Last resort | Built-in demo answers | Shown with a "demo answer" label, as the spec requires |

Node packages: `@google/genai` for Gemini, `groq-sdk` for Groq, `@tavily/core` for Tavily.

### Limits to plan around

- **Check your real Gemini limits before coding.** Google does not publish free-tier request limits; each project's are on the [AI Studio rate-limit page](https://aistudio.google.com/rate-limit). Limits apply per project, not per API key, so the whole team's testing draws on one pool.
- **One quota day covers the whole build.** Gemini's daily count resets at midnight Pacific, which is 12:30 PM IST. Run with `DEMO_MODE=true` while building UI so testing does not burn the quota the demo video needs.
- **Trim the prompt on fallback.** Groq's 8,000 tokens a minute is tight for research answers. When Groq is serving, send 3 search snippets and the last 4 messages.
- **Cache Tavily results.** 1,000 credits must cover development, the demo video and judging the following week.
- **Free Gemini traffic is used to improve Google's products.** That fits the handbook's data rules as long as nobody pastes company or customer information into CurioX.

### Considered and not used

| Option | Reason |
| --- | --- |
| Gemini 2.5 models | Google limits them to accounts that already used them and points new projects to 3.5 Flash-Lite or 3.8 Flash |
| Gemini 3.1 Pro Preview | Not available on the free tier |
| Gemini's built-in Google Search grounding | Not available on the free tier for the 3.x Flash models, so Tavily does the searching |
| OpenRouter `:free` models | 50 requests a day unless the account has bought 10 credits; too small even as a fallback |
| Embeddings and a vector database | Nothing to retrieve at this size, and the spec rules them out |

## File structure

One repository with four workspaces: shared types, server, web and mobile. The handbook requires a single common repo named `hackathon-<team-name>-<project-name>` with the final version on `main`.

```text
hackathon-cogniv8-CurioX/
├── README.md                # overview, business case, key features, deployment, team
├── .env.example
├── package.json             # npm workspaces: packages/*, server, web, mobile
├── docs/
│   ├── architecture.md
│   ├── api-contract.md      # request and response shapes, frozen at the API freeze
│   └── business-case.md     # use case, go-to-market, business plan
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts     # Profile, Message, Source, ChatRequest, SSE events
│           └── actions.ts   # learn action ids and labels
├── server/
│   ├── package.json
│   ├── scripts/
│   │   └── smoke.ts         # runs the judge journey against the API
│   └── src/
│       ├── index.ts         # load env, connect DB, listen
│       ├── app.ts           # express app, cors, routes, error handler
│       ├── config/env.ts    # validate env at boot
│       ├── db/
│       │   ├── connect.ts
│       │   └── models/      # User, Conversation, Message, SearchCache
│       ├── middleware/      # session (device ID), rateLimit, error
│       ├── routes/          # health, session, onboarding, profile, topics, chat, learn
│       ├── services/
│       │   ├── llm/         # index (fallback chain), gemini, groq, demo
│       │   ├── search/      # tavily, cache
│       │   ├── chat/        # orchestrator, router
│       │   ├── onboarding/  # steps, profile extraction
│       │   └── learn/       # quiz
│       ├── prompts/         # persona, onboarding, research, actions
│       └── utils/sse.ts
├── web/
│   ├── index.html
│   ├── vite.config.ts
│   ├── public/              # manifest.webmanifest, icons
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/client.ts    # fetch wrapper and SSE reader
│       ├── hooks/           # useSession, useChatStream
│       ├── pages/           # Welcome, Chat, Profile
│       ├── components/      # MessageBubble, SourceCard, ActionChips, TopicChips, Composer, StatusLine
│       └── features/learn/  # QuizCard
└── mobile/                  # stretch: Expo
    ├── app.json
    ├── eas.json
    ├── app/                 # expo-router: _layout, index, chat, profile
    └── src/                 # api/client.ts, components, hooks
```

- Routes stay thin and logic lives in `services/`, so any teammate can explain a file in one sentence. The handbook requires that someone can explain how it works.
- Prompts are files, not strings inside routes. Whoever tunes CurioX's voice never touches route code.
- `web` and `mobile` import only from `packages/shared` and their own `api/client.ts`, never from `server`.

## Deployment modes

Three modes share one codebase and differ only in environment variables. Deploy a hello-world to the hosted mode on Friday afternoon, so deployment is never a Saturday-morning surprise.

| Mode | API | Web | Mobile | Database |
| --- | --- | --- | --- | --- |
| Local development | `npm run dev -w server` on port 4000 | Vite dev server on port 5173 | Phone browser on the same Wi-Fi; Expo Go for the stretch app | Atlas M0, `curiox_dev` database |
| Demo mode (`DEMO_MODE=true`) | Same server, canned answers and sources labelled as demo, no outside calls | Unchanged | Unchanged | Unchanged |
| Hosted demo, what judges use | Render free web service, auto-deploy from `main` | Vercel or Netlify static site with `VITE_API_URL` set | PWA installed from the web URL; optional Android APK from EAS Build | Atlas M0, `curiox_prod` database |

### Free-tier behaviour to design for

- **Render sleeps.** A [free web service](https://render.com/docs/free) spins down after 15 minutes without traffic and takes about a minute to wake. Have the web app call `/api/health` on load and show a "Waking up CurioX" state, and open the URL a few minutes before any demo.
- **Atlas must accept Render's traffic.** Allow access from anywhere in Atlas network settings and use a long generated password. The database holds only test profiles.
- **EAS builds queue.** The [Expo free plan](https://expo.dev/pricing) includes 15 Android and 15 iOS builds a month in a low-priority queue that can wait 90 minutes or more, with a 45-minute build timeout. Start the APK build by 8:00 AM Saturday or skip it.
- **No iOS binary.** An installable iPhone build needs an Apple Developer account, so iPhones use the PWA.

### Environment variables

```bash
# server (set in Render, never in the client)
PORT=4000
MONGODB_URI=
GEMINI_API_KEY=
GEMINI_MODEL_MAIN=gemini-3.8-flash
GEMINI_MODEL_LITE=gemini-3.5-flash-lite
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
TAVILY_API_KEY=
CORS_ORIGIN=http://localhost:5173
DEMO_MODE=false

# web
VITE_API_URL=http://localhost:4000

# mobile (stretch)
EXPO_PUBLIC_API_URL=http://<laptop-ip>:4000
```

Only the two client URL variables are public. Create fresh keys for the hackathon; the handbook forbids production credentials.

## Implementation order

Backend first, as you prefer: the API is finished and frozen by 11:00 PM Friday, and the web app is built against it overnight. Times are IST targets against the Saturday 12:00 PM freeze; move them as a block if you start late.

| Phase | Target | Build | Done when |
| --- | --- | --- | --- |
| 0. Setup | Fri 3:00 PM | Repo under the handbook name, workspaces, `.env.example`, README skeleton with the five required sections, keys for Gemini, Groq, Tavily and Atlas, hello-world on Render and Vercel | Hosted `/api/health` answers and everyone can push |
| 1. API skeleton and model layer | Fri 5:00 PM | Express app, env validation, Mongo connection, device-ID session, `llm` service with streaming, Groq fallback, demo fallback, SSE helper | `curl` to `/api/chat` streams a Gemini reply; removing the Gemini key falls through to Groq, then to demo |
| 2. Onboarding and profile | Fri 7:00 PM | User model, onboarding steps, question phrasing, profile extraction, profile read, edit and clear | The smoke script completes onboarding and a profile appears in Atlas |
| 3. Personalized chat and research | Fri 9:30 PM | Orchestrator, persona prompt with profile and history, router, Tavily search with cache, `sources` event | A stable-concept question answers without searching; a current-events question returns real, clickable URLs |
| 4. Learn actions, quiz, topics | Fri 11:00 PM | `action` handling, quiz JSON, suggested topics, then freeze `api-contract.md` | Each action visibly changes the answer and the quiz JSON validates |
| 5. Web app | Sat 6:30 AM | Welcome and onboarding, chat with streaming, source cards, action chips, quiz card, profile page, loading, error and wake-up states, PWA manifest | The full judge journey works on the hosted URL |
| 6. Hardening | Sat 9:00 AM | Run the journey on a phone and a laptop, fix the top issues, test both fallbacks, finish the README | A teammate who did not build it completes the journey unaided |
| 7. Demo assets | Sat 11:30 AM | Demo video, presentation, business case; the APK only if phases 0 to 6 are done | Final push to `main` half an hour before the freeze |

### Two things to run beside the backend from the start

Backend-first leaves about six working hours for the whole frontend once rest blocks are counted. These two keep that from becoming the bottleneck without needing designs.

- **Design-independent frontend plumbing.** One person scaffolds `web/`, writes `api/client.ts` and `useChatStream`, and keeps an unstyled test chat page working against each backend phase. Integration bugs surface at 6 PM, not 2 AM.
- **A design deadline.** Three screens (Welcome and onboarding, Chat, Profile) by 8:00 PM Friday. If they slip, build with plain Tailwind and restyle when they land.

### Who does what

For a team of six or seven; "how the team used everyone" is 15% of the score.

| Lane | People | Until the API freeze | After it |
| --- | --- | --- | --- |
| Backend | 2 | Phases 1 to 4 | Fixes and hardening |
| Prompts and AI behaviour | 1 | Persona, onboarding questions, action prompts, router tests, demo-mode answers | Tune answers on judge-style questions |
| Frontend | 1 or 2 | Web scaffold, API client, stream hook, test chat page | Phase 5 |
| Design | 1 | The three screens | Loading, error and wake-up states, PWA icons |
| Business case and presentation | 1 | Use case, go-to-market and business plan in the README | Demo video script and slides |

Stagger the 90-minute rest blocks in pairs between midnight and 6:00 AM, so nobody works alone.

### If you fall behind

Cut in this order: the native APK, conversation history reload, dynamic suggested topics (use a fixed list per interest), the Groq fallback (keep the demo fallback). Do not cut onboarding, streamed personalized chat, research with sources, one learn action or the quiz; those are the spec's definition of done.

## Sources

Free-tier terms change without notice. These pages were read on 9 October 2026; recheck any limit you depend on.

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing): which models are free of charge, grounding availability, data use
- [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations): model release dates and the note limiting 2.5 models to existing users
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits): per-project limits and the midnight Pacific reset
- [Groq rate limits](https://console.groq.com/docs/rate-limits): free plan limits per model
- [Tavily credits and pricing](https://docs.tavily.com/documentation/api-credits): free credits and cost per search
- [OpenRouter limits](https://openrouter.ai/docs/api-reference/limits): free model request caps
- [Render free instances](https://render.com/docs/free): spin-down and wake time
- [Expo EAS pricing](https://expo.dev/pricing): free build allowance, queue and timeout
- Apty Hackathon 2026 Participant Handbook and the CurioX product vision, both attached in chat: dates, deliverables, judging weights and scope
