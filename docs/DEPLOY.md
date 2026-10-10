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
2. Render asks for the secret values: paste `MONGODB_URI` (the new one), `GROQ_API_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY`. The form takes one key per field, so the second account's keys go in `GROQ_API_KEY_2`, `GEMINI_API_KEY_2`, `TAVILY_API_KEY_2` (leave a `_2` field empty if you only have one key). The server folds them into one pool and switches keys when one is rate-limited. `AUTH_SECRET` is generated for you. More keys later: Environment tab → Add → `GROQ_API_KEY_3` and so on.
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

Two kinds, both on the phone (nothing is drawn inside the app):

- **Today's top update**, posted by the app when the issue loads. Works in the APK and in Expo Go on iPhone. Expo Go on Android cannot show notifications (the module is removed there since SDK 53), so the app skips it there.
- **Updates on what the reader follows**, sent by the server through Expo's push service: every `PUSH_INTERVAL_MIN` minutes (180 by default) it searches for fresh news on each registered reader's interests, adds a story to their issue and pushes "New in Cricket · <headline>". Tapping it opens the story. The profile page has "Check my topics now" to trigger it on the spot, which is handy in a demo.

For push to reach an Android phone, Expo needs Firebase Cloud Messaging (FCM) behind it, and the app needs the EAS project id in `app.json` (step 4 wrote it). Three things from Firebase, then one rebuild:

1. **Firebase project.** https://console.firebase.google.com → **Create a project** (name it CurioX; Google Analytics can stay off) → Continue.
2. **Android app + google-services.json.** On the project overview click the **Android** icon → Android package name `com.cogniv8.curiox` (must match `android.package` in `mobile/app.json`) → Register app → **Download google-services.json** → save it as `mobile/google-services.json`. Skip the SDK steps Firebase shows next. Then add to `mobile/app.json` under `"android"`: `"googleServicesFile": "./google-services.json"` and commit both (the file has no secrets, only project identifiers).
3. **Service-account key for Expo.** Firebase → gear icon → **Project settings** → **Service accounts** tab → **Generate new private key** → Generate. A JSON file downloads. Keep it private; never commit it.
4. **Give the key to Expo.** https://expo.dev → your account → project **curiox** → **Credentials** (left menu) → **Android** → the application identifier `com.cogniv8.curiox` → **FCM V1 service account key** → **Add a service account key** → upload the JSON from step 3 → Save.
5. **Rebuild**: `cd mobile && npx eas-cli@latest build --platform android --profile preview`, install the new APK, open it, allow notifications when asked, then on the profile page under Updates tap **Check my topics now**. `GET /api/push` on the server shows one phone registered.

iPhone builds need an Apple Developer account for push, so iPhones get the local notification only.

Without FCM the app still runs; `GET /api/push` just stays at 0 phones.

## 7. Demo-day checklist

- [ ] `npm run check-keys -w server`: every Groq, Gemini and Tavily key answers.
- [ ] Open the health URL two minutes before the demo so the API is awake.
- [ ] On the demo phone: sign up, answer the five questions, open the lead deck, pin a source, talk once, check Back issues.
- [ ] Phone volume up; on iPhone the silent switch mutes the voice.
- [ ] Wi-Fi or mobile data on the phone (the APK talks to Render, not the laptop).
- [ ] `DEMO_MODE=true` on Render is the emergency fallback if all keys are exhausted: canned issue and answers, no outside calls.

## 8. Rolling out a change

Push to `main`. Render redeploys the API by itself (about three minutes). The app only needs a new EAS build when files under `mobile/` or `packages/shared/` changed; API-only changes reach the installed app straight away.
