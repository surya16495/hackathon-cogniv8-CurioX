# CurioX architecture

The full plan, with its decisions, free-tier limits and timeline, is in [PROJECT_IDEA.md](PROJECT_IDEA.md). This page describes how the code implements it.

## Request flow for one chat message

`server/src/routes/chat.ts` → `services/chat/orchestrator.ts`

1. **`prepareChat`**: loads or creates the conversation (404 if it belongs to another device) and the last 10 messages. All plain HTTP errors happen here, before the stream opens.
2. **`runChat`**: saves the user message first, so it survives a failed answer.
3. **`services/chat/router.ts`**: one Flash-Lite JSON call decides whether to search. If no model is available, a keyword heuristic decides. Skipped entirely when no search key is set.
4. **`services/search`**: one Tavily basic search for 5 results. Results are cleaned (http(s) only, de-duplicated, snippets capped at 500 characters) and cached in Mongo for 6 hours under a normalized query hash. Failures and empty results are not cached.
5. **Prompt**: `prompts/persona.ts` + profile summary + numbered sources (`prompts/research.ts`) + the action instruction (`prompts/actions.ts`).
6. **`services/llm`**: streams with the chain Gemini → Groq → demo. Any error, a 30-second stall (`LLM_TIMEOUT_MS`) or an empty answer moves to the next provider. Groq gets a trimmed prompt: 3 sources and the last 4 messages.
7. Saves the assistant message with its sources and provider, then sends `done`.

## Design rules

- Routes are thin; logic lives in `services/`; prompts live in `prompts/`.
- Everything that calls a model has a non-model fallback: onboarding questions, profile extraction, the search router, topics and the quiz. **The demo never shows a raw error** because of a model outage.
- `DEMO_MODE=true` makes no outside calls at all. Use it while building UI to save quota.
- Identity is the `X-Device-Id` header (`middleware/session.ts`). Users are created on first sight, and a race between two first requests is handled.
- `services/index.ts` builds every service from env. Tests inject fake providers through `createApp(env, services)`.

## Tests

`npm test` uses an in-memory MongoDB and fake AI providers, so it costs no quota. It covers every route, the fallback chain (429, mid-stream failure, stall, empty answer, missing keys), search cleaning and caching, client disconnects, cross-device access, onboarding races and validation edges.

`npm run smoke` runs the judge journey against a running server (`API_URL=…` for the hosted one).

## Clients

- **Mobile (primary)**: `mobile/`, Expo SDK 57 with Expo Router. Routes in `src/app/` are thin guards; screens live in `src/screens/`, UI in `src/components/`, API access only in `src/api/client.ts`. Runs in Expo Go: no custom native modules.

## Voice mode (mobile)

`mobile/src/voice/VoiceProvider.tsx` runs one loop for the whole app: **speak → listen → understand → act**.

- **Speaking**: `expo-speech`, split into sentence-sized chunks (`chunkForSpeech`). Answers are cleaned of Markdown, citations and links first (`toSpeech`).
- **Listening on phones**: `expo-audio` records with level metering. It calibrates on room noise, notices speech, and stops after 1.5 s of silence. The clip goes to `POST /api/voice/transcribe` (Groq Whisper). Recording mode is switched off after each clip so replies play from the loudspeaker on iPhone.
- **Listening on the web build**: the browser's SpeechRecognition.
- **Understanding**: `parseCommand` in `packages/shared/src/voice/commands.ts` (unit-tested). A phrase is a command only when it is the *whole* utterance ("simplify", "quiz me", "B"). Anything else is dictation: an onboarding answer or a question.
- **Acting**: each screen declares itself with `useVoiceScreen({ screen, intro, onCommand, onDictation, quizOptions, confirming })`. Screens form a stack that mirrors navigation, so closing Profile hands voice back to Chat.
- Guard rails: it never listens while speaking (no echo); two silent turns pause listening until the mic is tapped; destructive commands ask for a spoken yes/no; it stops when the app goes to the background; the voice-mode choice is remembered.
