# Deep Work Dungeon

Android-first Expo React Native MVP for turning focused work sessions into dungeon rooms.

## Install

```powershell
npm.cmd install
```

## Start Expo

```powershell
npm.cmd run start
```

Scan the QR code with Expo Go on Android.

## Web Test

```powershell
npm.cmd run web
```

## Android / Expo Go Test

```powershell
npm.cmd run android
```

Or run `npm.cmd run start` and scan the QR code in Expo Go.

## Android Preview APK

Sign in to EAS once:

```powershell
npx.cmd eas-cli@latest login
```

Create an installable preview APK:

```powershell
npx.cmd eas-cli@latest build --platform android --profile preview
```

The first EAS build may ask to create or link an Expo project and generate Android signing credentials.

## Android Production AAB

Create a Google Play-ready Android App Bundle:

```powershell
npx.cmd eas-cli@latest build --platform android --profile production
```

This prepares an AAB only. Google Play submission has not been performed or configured.

## Validation

```powershell
npx.cmd tsc --noEmit
npx.cmd expo install --check
npx.cmd expo config --type public
```

## Phase Status

Implemented MVP flow: onboarding, hero setup, Camp, Quest Board, Dungeon Run timer, Room Result, rewards, streak/HP/floor progression, Quest Log, Armory upgrades, Streak Shield missed-day protection, and reset/test tools.

Android metadata and EAS profiles are configured for a preview APK and production AAB. No backend, accounts, analytics, ads, payments, push notifications, app blocking, or V2 features are included.
