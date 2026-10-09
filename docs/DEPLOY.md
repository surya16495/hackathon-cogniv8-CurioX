# Deploying CurioX

Three pieces: the API on Render, the database on MongoDB Atlas (already there), and the app as an
Android APK built by Expo's EAS. iPhones run it through Expo Go. Budget about two hours, most of it
waiting for the EAS build queue.

## 0. What you need before you start

| Item | Where to get it | Why |
| --- | --- | --- |
| A **new Atlas password** for the database user | Atlas → Database Access → Edit → Edit Password | The old one was pasted in a chat, so it is not a secret any more |
| A **Render** account (free) | https://render.com, sign in with GitHub | Hosts the API |
| An **Expo** account (free) | https://expo.dev/signup | Builds the APK |
| Your **API keys** | Already in `server/.env`: `GROQ_API_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY` | Pasted into Render, never committed |
| Team names and lanes | Ask the team | For the README |

Never paste keys or passwords into chat or into a commit. `server/.env` and `mobile/.env` are git-ignored.

## 1. Rotate the Atlas password (5 minutes)

1. Atlas → **Database Access** → the user in your connection string → **Edit** → **Edit Password** → Autogenerate → **Update User**.
2. Put the new password into `MONGODB_URI` in `server/.env`. For production, change the database name at the end of the URI from `curiox_dev` to `curiox_prod` so demo data starts clean.
3. Atlas → **Network Access** must allow `0.0.0.0/0` (Render's IPs change).
4. Check it: `npm run dev:server` and open http://localhost:4000/api/health. You want `"db":"connected"`.

## 2. Put the API on Render (15 minutes)

The repo has a `render.yaml` blueprint, so Render creates the service with every setting filled in.

1. Render dashboard → **New +** → **Blueprint** → connect the GitHub repo `surya16495/hackathon-cogniv8-CurioX` → **Apply**.
2. Render asks for the secret values: paste `MONGODB_URI` (the new one), `GROQ_API_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY`. Comma-separated keys from several accounts work here exactly as in `.env`. `AUTH_SECRET` is generated for you.
3. Wait for the first deploy (3 to 5 minutes). Open `https://curiox-api.onrender.com/api/health` and check for `"status":"ok"` and `"db":"connected"`.
4. If Render gave the service a different URL (names are global), copy it: you need it in step 3.

The free plan sleeps after 15 idle minutes and takes about 50 seconds to wake. The app's opening screen waits for it, and the notification card says "waking up CurioX" meanwhile. Before a demo, open the health URL two minutes early.

## 3. Point the app at the hosted API (2 minutes)

- `mobile/eas.json` already sets `EXPO_PUBLIC_API_URL` to `https://curiox-api.onrender.com` for the `preview` and `production` builds. If your Render URL differs, edit both lines and commit.
- For Expo Go testing against the hosted API, put the same line in `mobile/.env` (git-ignored):
  ```
  EXPO_PUBLIC_API_URL=https://curiox-api.onrender.com
  ```
  Remove it again to go back to the laptop's API.

## 4. Build the Android APK with EAS (15 minutes of work, 20 to 90 minutes of queue)

```bash
cd mobile
npx eas-cli@latest login                 # your Expo account
npx eas-cli@latest build:configure       # links the project: adds extra.eas.projectId to app.json
git add app.json && git commit -m "Link the EAS project" && git push
npx eas-cli@latest build --platform android --profile preview
```

- Answer **Yes** to generating a new Android keystore; EAS keeps it.
- The command prints a build page URL. When it finishes, the page has an **Install** button and a QR code: open it on the Android phone, download the APK, allow "install from this source", install.
- The `preview` profile makes an installable APK (not an AAB), which is what judges can sideload.
- To rebuild after a code change, run the last command again.

## 5. iPhone

Expo Go: run `npm run dev:mobile` with `EXPO_PUBLIC_API_URL` set in `mobile/.env` (step 3) and scan the QR code. Over a different network, use `npx expo start --tunnel` from `mobile/`. An installable iOS build needs a paid Apple Developer account, so Expo Go is the plan for judging.

## 6. Notifications

Today's top update is posted as a notification when the issue loads. It works in the APK and in Expo Go on iPhone. Expo Go on Android cannot show notifications (the module is removed there since SDK 53), so the code skips it on that one setup. Remote push (sending from the server while the app is closed) would need Firebase Cloud Messaging credentials and is not part of this release.

## 7. Demo-day checklist

- [ ] `npm run check-keys -w server`: every Groq, Gemini and Tavily key answers.
- [ ] Open the health URL two minutes before the demo so the API is awake.
- [ ] On the demo phone: sign up, answer the five questions, open the lead deck, pin a source, talk once, check Back issues.
- [ ] Phone volume up; on iPhone the silent switch mutes the voice.
- [ ] Wi-Fi or mobile data on the phone (the APK talks to Render, not the laptop).
- [ ] `DEMO_MODE=true` on Render is the emergency fallback if all keys are exhausted: canned issue and answers, no outside calls.

## 8. Rolling out a change

Push to `main`. Render redeploys the API by itself (about three minutes). The app only needs a new EAS build when files under `mobile/` or `packages/shared/` changed; API-only changes reach the installed app straight away.
