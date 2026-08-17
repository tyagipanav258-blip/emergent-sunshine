# Building an APK

`eas.json` is set up so the `preview` and `development` profiles emit an **APK**
(rather than the Play Store's `.aab`), which is what you want for sideloading
onto a phone or handing to someone for a demo.

Set `EXPO_PUBLIC_BACKEND_URL` in the profile you build before you build it —
it is baked into the bundle, and a build pointing at a URL the phone cannot
reach will look like a broken app.

## The one-command route (Expo builds it)

```bash
cd frontend
npm install -g eas-cli
eas login
eas init            # writes extra.eas.projectId into app.json — also what push needs
eas build --platform android --profile preview
```

Expo builds it on their machines and hands back a download link. First run asks
to generate an Android keystore; say yes and it is kept for you.

## The local route (you build it)

Needs the Android SDK — platform 35, build-tools 35, and a JDK 17+ — with
`ANDROID_HOME` set.

```bash
cd frontend
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk
```

`assembleDebug` gives an unsigned debug APK that installs without a keystore,
which is usually enough for testing on your own phone.

Install with `adb install -r <path-to-apk>`, or copy the file across and open it
on the phone with install-from-unknown-sources allowed.

## Why there is no APK in this repo

The container this was built in has no Android SDK, and `dl.google.com` — which
serves both the SDK command-line tools and the Android Gradle Plugin — is not
reachable from it. Expo's build API is unreachable too. Neither route above can
run here, so the configuration is committed and the build has to be run from a
machine with network access.

## Before shipping one

- `eas credentials` for a real signing key rather than a throwaway.
- Push notifications need the same `eas init` project id — see
  [push-notifications.md](./push-notifications.md).
- Run the backend with `DEMO_MODE=0` unless the build is for a demo, or every
  new account arrives pre-populated with sample medicines and relatives.
