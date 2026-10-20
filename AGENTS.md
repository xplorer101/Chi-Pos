This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Multi-device architecture

The shop can run on one phone (standalone) or on an admin phone plus cashier phones over the local Wi-Fi (`settings.deviceMode`).

- **Admin host** (`src/features/net/hostStore.ts`, `routes.ts`, `tcp.ts`): an HTTP server on `0.0.0.0:8799` (raw TCP via `react-native-tcp-socket`, so it needs a development build). It serves `/health`, `/pair/request`, `/pair/status`, `/catalog`, `/stock`, `/sales`, `/debtor-payments` and `/customers`. The admin auto-starts the server while `deviceMode === 'admin'`.
- **Cashier client** (`src/features/net/clientStore.ts`, `salesQueue.ts`, `syncWatcher.ts`): pairs with a key, mirrors the catalog into the local DB, and writes every sale, debt payment and customer it creates into the `outbox` table (shared UUID = idempotency key) before pushing it. The queue drains oldest-first with customers ahead of everything else, and stops at the first network error; failed entries are retried, never dropped.
- **Pairing security**: the QR carries `PairingInfo` JSON (`protocol.parsePairingInfo`). A key lasts 10 minutes and pairs one phone (`pairingKey.ts`); five wrong keys pause pairing for a minute. Only `cashier` accounts can be bound to a phone (`hostStore.approve`).
- **Sync triggers**: after every write, on app foreground, on network recovery, and by a 30 s retry timer while the queue is non-empty. A flush is serialized by a lock and is followed by a catalog pull when the queue empties.
- **Data ownership**: the admin DB is the source of truth. Cashier phones keep mirrors (`stock_snapshot`, `customer_balance_snapshot`) and never block a sale on stock, so negative stock is a signal for the admin to reconcile, not an error.

When adding a new synced record, follow the pattern: outbox kind + `POST` route with token auth + idempotent admin-side upsert, then enqueue from `salesQueue.ts`.
