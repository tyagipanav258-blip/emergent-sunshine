# Push notifications

The in-app inbox only reaches someone who has already opened Sunshine. Push is
what makes an SOS reach a phone that is face-down on a bedside table.

Every notification the backend writes to the inbox is also delivered to that
user's registered devices. The inbox row is written first, so a push that fails
can never lose the notification itself.

## How it fits together

| Piece | Where |
| --- | --- |
| Permission, token, listeners | `frontend/src/push.ts`, `frontend/src/hooks/use-push.ts` |
| Status card the user reads | `frontend/src/components/AlertSettings.tsx` |
| Device registry and sending | `backend/server.py`, "PUSH DELIVERY" section |
| Register / unregister / test | `POST /api/devices/register`, `/devices/unregister`, `/devices/test` |

`usePush()` is mounted from both role layouts, so whichever app is open claims
the phone. `signOut()` releases it, so a handed-back handset stops receiving
someone else's medicine reminders.

## Urgency

`sos` and `missed_dose` are sent at high priority on the `urgent` Android
channel, which is created with `MAX` importance and `bypassDnd`. Everything else
arrives quietly on `default`. On iOS, high priority is as far as we can go — a
true critical alert that overrides silent mode needs an entitlement Apple grants
case by case.

## What you must set up

Push needs a real build. It does **not** work in Expo Go (removed in SDK 53), in
a simulator, or on web — in each case the profile screen says so rather than
pretending alerts are on.

1. **An EAS project id.** Run `eas init` in `frontend/`. It writes
   `extra.eas.projectId` into `app.json`, which is what Expo needs to mint a push
   token. Without it the app reports "Alerts are not set up yet".
2. **Credentials for the stores.** `eas credentials` — an APNs key for iOS, and
   a Firebase service account (`google-services.json` + FCM v1 key) for Android.
3. **A development or production build.** `eas build --profile development`.
4. **`EXPO_ACCESS_TOKEN` on the backend.** Optional but strongly recommended:
   without it, anyone who learns one of your push tokens can send to your users.
   Create it in the Expo dashboard under Access Tokens.

Backend environment:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PUSH_ENABLED` | `1` | Set to `0` to keep everything in-app only |
| `EXPO_ACCESS_TOKEN` | empty | Authenticates sends to Expo |
| `EXPO_PUSH_URL` | Expo's endpoint | Override to point at a fake in tests |
| `PUSH_SYNC` | `0` | Await sends instead of firing and forgetting; tests only |

## Checking it works

Sign in on a real device and open Profile → **Alerts on this phone**. If it says
"Alerts are on", tap **Send a test alert** — that goes only to your own devices
and proves the whole path, rather than finding out during an emergency.

## Housekeeping

Expo replies to each message with a ticket. When it reports `DeviceNotRegistered`
the token is dead — the backend marks that device disabled and stops sending to
it. Registering the same token again clears the flag, so reinstalling the app
revives the device rather than orphaning it.

Devices are keyed on the token, not the user. Registering a token that already
belongs to someone else moves it, which is what makes a shared handset behave.
