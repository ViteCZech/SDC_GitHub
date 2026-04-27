# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Simple Dart Counter is a client-side React PWA (Progressive Web App) for scoring darts games (X01 and Cricket modes) with tournament management. The single application lives in the `simple-dart-counter/` subdirectory. All backend services (Firestore, Firebase Auth) are cloud-hosted — there is no local backend to run.

### Working directory

All npm commands (`npm run dev`, `npm run build`, `npm run lint`) must be run from `/workspace/simple-dart-counter/`, not the repository root.

### Running the dev server

```
cd /workspace/simple-dart-counter
npm run dev -- --host 0.0.0.0
```

The app will be available at `http://localhost:5173/`.

### Lint

```
cd /workspace/simple-dart-counter
npm run lint
```

Pre-existing lint errors exist in generated files under `dev-dist/` (Workbox service worker). These are not related to application source code.

### Build

```
cd /workspace/simple-dart-counter
npm run build
```

A warning from `vite-plugin-pwa` about bundle variable assignment is expected and non-blocking.

### Key caveats

- The app uses **Vite 8 beta** (`^8.0.0-beta.13`) with an `overrides` field in `package.json` to pin it.
- Firebase config (API keys, project ID) is hardcoded in `src/firebase.js` — no `.env` files are needed.
- The UI is primarily in Czech. Button labels like "Nová hra" (New Game) and "START ZÁPASU" (Start Match) are Czech translations.
- The main application component `App.jsx` is very large (~4000 lines). Most app logic lives there.
- No automated test suite exists in this project (no test framework configured).
