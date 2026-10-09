# CurioX API contract

The TypeScript source of truth is [`packages/shared/src/types.ts`](../packages/shared/src/types.ts).
The mobile app imports types from `@curiox/shared`, never from `server/`.

**Status: draft. Freeze at the end of phase 4 (Fri 11:00 PM).** After the freeze, change shapes only with the frontend lane's agreement.

## Conventions

- Base URL: `EXPO_PUBLIC_API_URL` (local: the laptop's IP, port 4000; see the README).
- **Identity:** every route except `/api/health` needs an `X-Device-Id` header: 8–128 characters from `A-Z a-z 0-9 - _`. The app generates it once (a UUID) and keeps it in AsyncStorage. The user is created on first use.
- **Native apps send no `Origin` header**, so CORS never blocks them. `CORS_ORIGIN` only matters for browser clients.
- **Errors** are always JSON: `{ "error": { "code": string, "message": string, "details"?: any } }`.

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR`, `BAD_REQUEST`, `INVALID_JSON` | Bad body or query |
| 401 | `UNAUTHORIZED` | Missing or malformed `X-Device-Id` |
| 403 | `CORS_FORBIDDEN` | Origin not in `CORS_ORIGIN` |
| 404 | `NOT_FOUND` | Unknown route, or a conversation that does not exist **or belongs to another device** |
| 409 | `CONFLICT` | Onboarding advanced in another request (double tap). Re-fetch the question. |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 32 KB |
| 429 | `RATE_LIMITED` | Chat over 20/min per device, quiz over 10/min, or more than 300/min per IP |
| 500 | `INTERNAL` | Bug; message is generic |

## Routes

### `GET /api/health`
No device ID. Call on app load and show a "Waking up CurioX" state until it answers (Render can take about a minute to wake).
```json
{ "status": "ok", "uptimeSeconds": 12, "db": "connected", "demoMode": false,
  "providers": { "gemini": true, "groq": true, "tavily": true, "stt": true }, "version": "0.1.0" }
```

### `POST /api/session`
Creates or loads the user. `201` the first time, `200` after that.
```json
{ "userId": "…", "deviceId": "…", "isNew": true,
  "profile": { "interests": [], "knowledgeLevels": [], "goals": [], "explanationStyle": "", "tone": "", "curiosities": [] },
  "onboarding": { "status": "not_started", "step": 0, "totalSteps": 6 } }
```
`onboarding.status`: `not_started` | `in_progress` | `completed` | `skipped`. Show onboarding unless it is `completed` or `skipped`.

### `POST /api/onboarding/message`
Body (all optional): `{ "message"?: string (≤1000), "skip"?: "question" | "all", "restart"?: true }`

| Body | Effect |
| --- | --- |
| `{}` | Start onboarding, or re-send the current question (safe after a refresh) |
| `{ "message": "…" }` | Answer the current question; returns the next one. A message sent before onboarding has started is treated as a greeting. |
| `{ "skip": "question" }` | Skip this question |
| `{ "skip": "all" }` | Finish now with whatever is known |
| `{ "restart": true }` | Start over from question 1 |

```json
{ "onboarding": { "status": "in_progress", "step": 1, "totalSteps": 6 },
  "question": { "key": "knowledgeLevels", "text": "Nice! How much do you already know about those?" },
  "profile": null }
```
When finished, `question` is `null` and `profile` is filled. Requests after the end return the same finished state.

### `GET /api/profile` · `PUT /api/profile` · `DELETE /api/profile`
- `GET` → `{ profile, onboarding }`
- `PUT` body: any subset of the profile fields; omitted fields are kept, and unknown fields are a 400. `knowledgeLevels[].level` is `beginner` | `intermediate` | `advanced`. Limits: list items 1–200 characters, at most 20 per list (10 for goals). → `{ profile, onboarding }`
- `DELETE` clears the profile and resets onboarding to `not_started`. Add `?history=true` to also delete all conversations. → `{ profile, onboarding }`

### `GET /api/topics/suggested`
`{ "topics": [{ "title": "Black holes", "prompt": "What happens inside a black hole?" }], "provider": "gemini" }`. Returns 4–6 topics. `prompt` is ready to send as a chat message.

### `POST /api/chat`
Body: `{ "message"?: string (≤4000), "conversationId"?: string, "action"?: LearnActionId, "stream"?: boolean }`

- At least one of `message` or `action` is required.
- Omit `conversationId` to start a new conversation; its ID comes back in the `status`/`done` events.
- `action` is one of `simplify`, `go_deeper`, `real_world_example`, `challenge_me`, `compare_perspectives` (labels are in `LEARN_ACTIONS`).
  - An action **without** a message applies to the previous answer, so it needs a `conversationId` that already has an answer (otherwise 400).
  - An action **with** a message applies to that message.
- Validation and 404 errors come back as normal JSON **before** the stream starts. Check `res.ok` before reading the stream.

**Streaming (default):** `Content-Type: text/event-stream`. Read it with `fetch` plus a stream reader, not `EventSource` (which cannot POST or send headers). In React Native use `fetch` from `expo/fetch`, which supports streamed bodies. Lines starting with `:` are heartbeats; ignore them.

| Event | Data | Client action |
| --- | --- | --- |
| `status` | `{ stage: "thinking" \| "searching" \| "writing" \| "retrying", message, conversationId?, provider?, reset? }` | Show `message` in the status line. **If `reset` is true, clear the partial answer text**: a provider failed mid-answer and the next one starts over. |
| `sources` | `{ sources: [{ id, title, url, snippet }] }` | Render source cards. Arrives before tokens. `[n]` in the answer refers to `id`. |
| `token` | `{ text }` | Append to the answer (Markdown). |
| `done` | `{ conversationId, messageId, provider, demo }` | Finish. If `demo` is true, show the "demo answer" label. |
| `error` | `{ message, code, conversationId? }` | Show the error with a retry button. |

**Non-streaming:** `stream: false` in the body or `?stream=false`:
```json
{ "conversationId": "…", "userMessage": ChatMessage, "assistantMessage": ChatMessage, "provider": "gemini", "demo": false }
```
`ChatMessage = { id, conversationId, role, content, sources, action, provider, createdAt }`

If the client disconnects mid-answer, the server stops generating and saves the partial answer, ending with " …".

### `GET /api/conversations` · `GET /api/conversations/:id/messages`
- List: `{ conversations: [{ id, title, updatedAt }] }`, newest first, at most 50.
- Messages: `{ conversationId, title, messages: ChatMessage[] }`, oldest first, the last 200.

### `POST /api/learn/quiz`
Body: `{ "topic"?: string, "conversationId"?: string, "count"?: 3-5 (default 4) }`. Needs a topic or a conversationId; with a conversation, the quiz covers what was discussed.
```json
{ "topic": "Tides", "provider": "gemini",
  "questions": [{ "question": "…?", "options": ["a","b","c","d"], "answerIndex": 2, "explanation": "…" }] }
```
Every question has exactly 4 distinct options. If `provider` is `"demo"`, label it as a demo quiz.

### `POST /api/voice/transcribe`
Speech-to-text for voice mode (Groq Whisper). The body is the **raw audio file**, not JSON or multipart.

- Headers: `Content-Type` is one of `audio/m4a`, `audio/mp4`, `audio/webm`, `audio/ogg`, `audio/mpeg`, `audio/wav`. Optional `X-Voice-Lang: en-IN` (the first two letters are used as a language hint).
- At most 5 MB; 30 requests a minute per device.
- `200 { "text": "go deeper on black holes" }`. The text can be empty if nothing was said.
- `503 VOICE_UNAVAILABLE` when the server has no `GROQ_API_KEY` (check `providers.stt` on `/api/health`; the app hides the mic in that case). `502 TRANSCRIBE_FAILED` when Whisper fails, `400` for empty or unsupported audio.
- Works with `DEMO_MODE=true` too: transcribing the user's own speech is the one Groq call demo mode still makes.

## The zine (added 9 Oct, evening)

Shapes live in [`packages/shared/src/zine.ts`](../packages/shared/src/zine.ts) and [`reader.ts`](../packages/shared/src/reader.ts).

### `POST /api/onboarding/tailor`
Body `{ "interests": string[] }` (1–12). Returns questions 2–6 of the reader card, shaped by those interests:
`{ "questions": ReaderQuestion[], "provider": "demo" | "groq" | "gemini" }`. The ten suggested interests are answered instantly from built-in banks (`provider: "demo"`); typed interests get one quick model call. The app also computes the same thing offline with `tailorQuestions()` and uses this response only to refine it.

### `POST /api/onboarding/complete`
Body `{ "reader": { interests, level, goals, style, tone, curious: string[] } }`. Saves the card as the profile (the old `profile` fields are derived from it; `profile.reader` keeps the card) and marks onboarding `completed` (or `skipped` when empty). Returns `ProfileResponse`. `PUT /api/profile` accepts `{ "reader": … }` too.

### `GET /api/issues/today?date=YYYY-MM-DD`
The reader's issue for `date` (their local date; implausible dates fall back to today). Made on first request (search + models, ~5–20 s), then kept for the day. 10/min per device.
`{ "issue": { no, date, lead: Deck, stories: Deck[], quiet: string[] }, "backIssues": DeckSummary[] }`
- `lead.kind` is `lead` (from today's news) or `demo` (labelled, evergreen, when every model failed). `stories` has one 3-card deck per interest with news; `quiet` lists interests with nothing today.
- `Deck.cards` is a list of typed cards: `hook`, `what`, `why`, `myth`, `ways`, `vs`, `guess`, `watch` (YouTube id), `simple`. Every card is validated on its own; a bad card is dropped, not the deck.
- `Deck.teach` is the teach-it-back prompt; `Deck.quiz` the deck's own questions; `art` keys name files in `mobile/assets/art/`.

`DELETE /api/issues/today?date=…` forgets the issue so the next GET makes a fresh one (used after the reader card changes).

### `GET /api/decks/:id` · `POST /api/decks`
`POST` body is `{ "from": "chat", "conversationId" }` ("Show as cards") or `{ "from": "talk", "title"?, "points": [{ h, say }] }` ("Staple into a deck"). Returns the new `Deck` (201). Decks belong to the device; other devices get 404.

### Talk: `POST /api/talk/open` · `POST /api/talk` · `POST /api/talk/finish` · `POST /api/talk/teach`
Voice lives only in the Talk tab. The server drives a guided conversation; every reply is plain spoken sentences, returned as points (each becomes a slip on screen). The words and the device voice (rate, pitch) follow the reader's tone: `friendly`, `casual` or `playful` (`voiceToneOf(profile.tone)`; the Talk screen's chips set `profile.tone`).
- `open` `{ date?, hour? }` → `{ points, reply, stage: "topic", provider }`: hello, what's new in today's issue, "what do you want to learn about?".
- `talk` `{ message, history?, stage, topic?, date? }` → `{ points, reply, stage, topic, done, provider }`. Stages: `topic` (explain, ask their view) → `view` (react, explain the impact, ask what they make of it) → `reflect` (respond, offer to go deeper or wrap up) → `free`. Each guided stage always ends on a question. `done` is true when the reader says goodbye (also offline).
- `finish` `{ topic?, history, points, date? }` → `{ topic, keyPoints, interest (0–100), level, addedInterest, deckId, reply, profile, provider }`. Saves a `TalkSession`. With `level: "high"` the topic is added to the reader's interests (profile and reader card) and, if there is news on it, a story deck tagged "from your talk" is added to today's issue so Home shows it under the new interest.
- `teach` `{ q, said, sample? }` → `{ verdict: "got_it" | "nearly" | "not_yet", feedback, add, provider }`.
