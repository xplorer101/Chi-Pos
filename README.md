# ShopPOS

Offline-first Android point-of-sale for small shops (v1 targets provision shops). Every byte of data
lives on the phone — there is no account, no server and no network permission needed to sell.

Built with Expo (React Native) + TypeScript, `expo-router` and `expo-sqlite`.

## What it does

- **Sell** — search or scan a barcode, build a cart, pick a customer, take cash / transfer / POS /
  credit (or a split), and print a shareable receipt image. A sale, its lines, its payments and the
  resulting stock movements are written in **one SQLite transaction**, so the books can never be
  half-updated.
- **Items** — generic catalogue with categories, barcodes, cost and selling prices, optional
  stock tracking, multiple selling units (single / pack / carton) and a low-stock threshold.
  Restock and adjust actions append history instead of overwriting it.
- **Customers** — names, phone numbers, notes, and a running credit balance (derived, never
  stored) with part-payment recording.
- **Reports** — today / week / month sales, payment-method split, estimated profit, top sellers,
  low-stock warnings, outstanding debt and an end-of-day "cash in drawer" summary.
- **Settings** — shop name and receipt footer, app PIN (4–6 digits, SHA-256 hashed), optional
  fingerprint unlock, sample data, and a JSON backup export.
- **Lock screen** — optional PIN that re-arms whenever the app goes to the background.

## Rules the code enforces

| Rule | Where |
| --- | --- |
| Money is an integer number of **kobo** — never a float | `src/lib/money.ts` |
| Stock is derived by summing `stock_movements.quantity_base` | `src/db/stock.ts` |
| A sale is atomic (sale + lines + payments + movements) | `src/db/repositories/salesRepo.ts` |
| Receipt numbers are sequential (`0001`), assigned inside the sale transaction | `src/db/repositories/salesRepo.ts` |
| Credit balance is derived from payments, never a stored column | `src/db/repositories/customersRepo.ts` |
| Every table has `created_at`, `updated_at`, `deleted_at` (soft delete) and `device_id` | `src/db/migrations.ts` |

## Project layout

```
src/
  app/            routes (expo-router); every file is a screen, _layout.tsx is a navigator
  components/     UI kit: Button, Card, Input, Sheet, ChipRow, Screen, LockScreen…
  db/             schema, migrations, repositories (SQL), stock maths, seed data
  features/       feature logic: sell (cart maths + store), auth, receipts
  lib/            money, dates, ids, PIN hashing
  theme/          light + dark tokens, Inter font loading
```

## Develop

```bash
npm install
npx expo start        # dev server (scan the QR with Expo Go or a dev build)
npm test              # 55 unit tests: money, stock, sale totals
npm run typecheck     # tsc --noEmit
npm run lint          # expo lint
```

## Build a release APK

The APK below was built locally with the Android SDK — no Expo account required.

```bash
# 1. Native project (regenerates ./android; never edit it by hand)
npx expo prebuild --platform android --no-install

# 2. Compile
cd android
ANDROID_HOME=$HOME/android-sdk ./gradlew assembleRelease

# 3. Install
adb install -r app/build/outputs/apk/release/app-release.apk
```

The build needs JDK 17, Gradle 9.3.1 (downloaded by the wrapper) and the Android SDK packages
`platforms;android-36`, `build-tools;36.0.0` and `ndk;27.1.12297006`.

Notes:

- The generated `android/app/build.gradle` signs the release build with the debug keystore, so the
  APK installs and runs fine for testing but should be re-signed with your own key before a store
  upload (`eas build` handles signing automatically once you are logged in).
- Cloud builds: `npx eas-cli@latest build -p android --profile preview` (profile added in
  `eas.json`) produces a downloadable `.apk` from Expo's servers.

## v1 scope / known limits

- Business type is fixed to `provision_shop`; currency is ₦ only.
- Backup export only — there is no import yet, and no cloud sync (the `device_id` + `updated_at`
  columns are in place for a future sync service).
- Barcode scanning needs a camera permission and therefore a real device or emulator with a camera.
