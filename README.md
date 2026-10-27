# Kvarteret Internbevis (Expo)

React Native reimplementation of `kvarteret_internbevis` using Expo.

## Run in Expo Go

1. Install dependencies:

```bash
npm install
```

2. Start Expo:

```bash
npm run start
```

3. Open the project in Expo Go by scanning the QR code.

## Development builds (installable dev clients)

Expo Go is useful for fast iteration, but development builds are required when
you need native modules/config that Expo Go does not include and when you want
to share installable test builds with teammates.

This repo now includes dedicated EAS build profiles:

- `development-android`
- `development-ios` (physical iPhone/iPad, Ad Hoc)
- `development-ios-simulator`

### Build commands

```bash
npx eas build --platform android --profile development-android
npx eas build --platform ios --profile development-ios
npx eas build --platform ios --profile development-ios-simulator
```

Or use npm scripts:

```bash
npm run build:dev:android
npm run build:dev:ios
npm run build:dev:ios-simulator
```

### Run locally in a development build

After installing the dev client build on your device/simulator:

```bash
npx expo start --dev-client
# or
npm run start:dev-client
```

### Sharing strategy by platform

1. Android: share the EAS install link from the build details page.
2. iOS device: testers must be on the Ad Hoc provisioning profile (UDID
   registered via Apple Developer/EAS).
3. iOS simulator: teammates can install with `npx eas build:run --platform ios --profile development-ios-simulator`.

### Optional: run all dev builds via EAS Workflow

```bash
npx eas workflow:run .eas/workflows/create-development-builds.yml --wait
# or
npm run workflow:dev-builds
```

## Class name utility (`cn`)

Use `cn` to compose `className` values with conditionals and automatically
resolve conflicting Tailwind utilities (last one wins).

```tsx
import { Pressable } from "react-native";
import { cn } from "@/shared/utils/cn";

<Pressable
  className={cn(
    "rounded-xl px-4 py-3 bg-green-600",
    isDisabled && "bg-surface-muted border-border",
    isPrimary ? "bg-green-600" : "bg-slate-600",
  )}
/>;
```

## Architecture and screen workflow

The app uses **Feature-first**, with screen logic as composed hooks rather than a ViewModel layer:

- Feature-first folders are the default (`src/features/<feature>`).
- For complex screens, compose several focused hooks in `vm/` (e.g. `useOtpRequest`, `useTokenLogin`), each returning ~8 members or fewer — not one hook that owns the whole screen.
- Keep simple screens lean (render + simple local state) when composed hooks don't add value.
- Cross-cutting code every feature may depend on lives in `src/shared`; platform infra with no product knowledge lives in `src/core`.
- The four feature/domain/shared boundary rules are enforced in CI via `npm run lint:architecture` (`dependency-cruiser`), not just by review.

Architecture policy (file name kept for history; content covers the current composed-hooks rule):

- `/Users/kluvin/dev/kvarteret/kvarteret-internbevis-rn/docs/architecture/FEATURE_FIRST_MVVM_LITE.md`

Project skill and implementation reference for adding screens:

- `/Users/kluvin/dev/kvarteret/kvarteret-internbevis-rn/docs/skills/new-screen/SKILL.md`

## Data storage and PII

- **Session token / login credentials**: `expo-secure-store` (`src/core/storage/sessionStorage.ts`), backed by iOS Keychain / Android Keystore. Correct tool for secrets.
- **Cached member card** (name, birth date, photo URL, role history — `session_cached_user:v2`) and other app state: `AsyncStorage` (`src/core/storage/asyncStorage.ts`), which is OS-file-based storage, not hardware-backed.

Decision (2026-07-07, product owner): keep the cached card in AsyncStorage for now rather than moving it into SecureStore. Rationale:

- The card payload (with role history) is roughly 2–4 KB of JSON, above Android Keystore's practical ~2 KB comfort limit — SecureStore is the wrong tool for this size, not just a smaller version of the right one.
- AsyncStorage on both platforms sits on OS-level file encryption (iOS Data Protection, Android's encrypted filesystem on modern devices), and the cache is cleared on logout (`clearCachedUser`).
- The data is moderate-sensitivity (a membership card, not a credential) and the app already treats it as ephemeral/reconstructable from the network.

Planned follow-up: migrate the cached-card storage to app-layer envelope encryption (a random AES key held in SecureStore/Keychain, payload encrypted at rest in regular storage — typically `react-native-mmkv`'s encryption mode in RN) at the next native-build window, since it requires a new native dependency. Tracked as a Linear ticket (see `plans/mmkv-migration-ticket.md` for the drafted ticket body pending manual creation — no Linear MCP was connected when this was written).

## Preview deployments (EAS + Firebase App Distribution)

This repository is configured for hybrid previews:

1. PR-level JS previews with EAS Update (`.github/workflows/preview-update.yml`).
2. On-demand installable preview binaries with EAS Build + Firebase App Distribution (`.github/workflows/preview-build-distribute.yml`).

### One-time setup required

1. Create or select the dedicated Firebase preview project.
2. Register Android app id `com.kvarteret.internbevis.intern_bevis_kvarteret` in Firebase App Distribution.
3. Register iOS app id `com.kvarteret.internbevis.internBevisKvarteret` in Firebase App Distribution.
4. Create Firebase tester group `internal-qa`.
5. Link the Expo project to EAS and get the project id UUID.
6. Verify `/Users/kluvin/dev/kvarteret/kvarteret-internbevis-rn/app.json` contains:
   - `extra.eas.projectId = 8e46104c-a94c-4205-9884-4f813b6371c3`
   - `updates.url = https://u.expo.dev/8e46104c-a94c-4205-9884-4f813b6371c3`

### Required GitHub secrets

1. `EXPO_TOKEN`
2. `FIREBASE_SERVICE_ACCOUNT_PREVIEW` (full JSON key content)
3. `FIREBASE_ANDROID_APP_ID_PREVIEW`
4. `FIREBASE_IOS_APP_ID_PREVIEW`
5. `FIREBASE_DISTRIBUTION_GROUPS_PREVIEW` (optional, defaults to `internal-qa`)
6. `EXPO_PROJECT_ID` (for operational reference in CI and setup)

### How preview workflows trigger

1. `preview-update.yml` runs on PR open/update/reopen and publishes EAS updates to branch `pr-<PR_NUMBER>`.
2. `preview-build-distribute.yml` runs only when the PR has label `preview`.
3. Add label `preview` to request Android/iOS preview binaries.
4. Remove label `preview` to stop triggering binary preview builds on new commits.

### iOS Ad Hoc onboarding

1. Collect tester UDIDs.
2. Register devices through EAS/Apple Developer for the preview provisioning profile.
3. Re-run preview build after adding devices so new testers can install the iOS build from Firebase App Distribution.

## Production releases

There are two release paths:

- `.github/workflows/ota-update.yml` publishes a production OTA update. Run it from `development` (Actions → OTA update → Run workflow) for JS/asset-only changes. It targets the runtime in `app.json`'s `version`.
- `.github/workflows/release-submit.yml` builds store binaries and submits to TestFlight internal + Play internal testing. It runs only when a GitHub Release is published.
- `.github/workflows/release-promote-checklist.yml` creates the manual promotion checklist for App Store Connect and Google Play.

### Required release secrets

1. `EXPO_TOKEN`
2. `APP_STORE_CONNECT_ISSUER_ID`
3. `APP_STORE_CONNECT_KEY_ID`
4. `APP_STORE_CONNECT_API_KEY_P8`
5. `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
6. `TESTFLIGHT_INTERNAL_GROUPS` (optional, comma-separated)

### Release versioning

`release-submit.yml` is the single source of truth for release version numbers — it computes them, date-driven:

1. App version: `YYYY.M.<build-sequence>`
2. iOS `buildNumber`: unix timestamp (seconds)
3. Android `versionCode`: unix timestamp (seconds)

`app.json`'s `version`/`buildNumber`/`versionCode` fields are **local/dev-build values only**. Do not bump them by hand as part of a release — the workflow overwrites them at build time. They exist so `expo run:ios`/`expo run:android` and Expo Go have a sane version during local development.

### How to release to the stores

1. Publish a GitHub Release with a `release-*` tag. The release body becomes the TestFlight "what to test" text.
2. `release-submit.yml` starts on publish. To retry a failed submit, run it manually with the same `release_tag`; pass `ios_build_id`/`android_build_id` to submit finished EAS builds without rebuilding.
3. Validate in TestFlight internal + Play internal.
4. Run `release-promote-checklist.yml` and complete manual production promotion in store consoles.

## Local backend (infra + Personaldatabase)

For local development against the `infra` backend stack, the API root is:

- `http://localhost:5001/api`

The mobile-card endpoints used by this app are under:

- `http://localhost:5001/api/v1/mobile-card`

When running Expo Go on a physical device, `localhost` points to the phone, not your computer.
Use your computer LAN IP instead.

Create `/Users/kluvin/dev/kvarteret/kvarteret-internbevis-rn/.env.local`:

```bash
EXPO_PUBLIC_INTERNKORT_BASE_URL=http://<LAN-IP>:5001/api/v1/mobile-card
EXPO_PUBLIC_KVARTERET_PERSONAL_API_BASE_URL=http://<LAN-IP>:5001/api/v1
```

The first URL is used for login and card requests. The second is the shared
Personal API root used by feedback. Set both so local feedback does not
silently target production while login targets your local backend.

Then start the app:

```bash
npm run start
```

## Public events API

The event feed consumes the anonymous occurrence API documented at
`https://www.samfunnetibergen.no/api/v1/openapi.json`. Set
`EXPO_PUBLIC_SAMFUNNET_API_BASE_URL` to point at another compatible deployment;
the production website is used by default.

The checked-in client is generated from that OpenAPI document:

```bash
npm run api:generate:events
npm run api:check:events
```

For local or pinned contract generation, set `SAMFUNNET_EVENTS_OPENAPI` to an
OpenAPI URL or file path before running either command.

## Kvarteret Personal API (Skiftlista)

Skiftlista calls Personal's `/api/v1/mobile-card/shifts/*` routes with the
mobile-card session token. The typed client in
`src/core/api/kvarteret-personal` is generated from Personal's `openapi.json`,
keeping only the operations tagged `mobile-shifts`:

```bash
npm run api:generate:personal
npm run api:check:personal
```

The generator reads `../kvarteret-personal/openapi.json` (a sibling checkout)
unless `KVARTERET_PERSONAL_OPENAPI` points at another file. The check is not
part of `npm run api:check` yet, because CI has no Personal checkout.

## Expo Go login-link support

Expo Go cannot register the production custom URL scheme the same way as a standalone app.

The OTP screen includes **Use link from clipboard**:

1. Copy the login link from email.
2. In the app OTP screen, tap **Use link from clipboard**.
3. The app extracts `accessToken` and logs in.

You can still paste/type the code manually in the OTP field as usual.
