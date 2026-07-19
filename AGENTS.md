# Agent Contribution Guide

## Project overview

Behind You is a private, offline-first, mobile-first Vue progressive web app. It records one short, silent camera video into browser memory so the user can inspect their hair, then destroys the take. There is no backend, account, analytics, media upload, download, or sharing feature.

The production site targets iPhone Safari and Android Chrome and is deployed as a static PWA to GitHub Pages at `/behindyou/`.

## Repository structure

- `src/App.vue` — state-driven full-screen UI, camera controls, review controls, and accessibility labels.
- `src/composables/useBehindYouRecorder.ts` — recording state machine, camera preference, timers, errors, lifecycle cleanup, and ownership of transient media.
- `src/services/browserMediaCapture.ts` — browser adapter for `getUserMedia`, `MediaRecorder`, MIME selection, and track disposal.
- `src/domain/media.ts` — shared states, media types, and the `MediaCapturePort` boundary.
- `src/components/ui/` — local shadcn-vue primitives. Reuse these before creating bespoke controls.
- `src/assets/main.css` — application layout, mobile safe-area handling, and visual states.
- `src/test/` and `src/**/*.test.ts` — Vitest setup and unit/component tests.
- `tests/e2e/` — Playwright mobile Chromium/WebKit tests and deterministic browser-media mocks.
- `public/icons/` — install and maskable PWA icons.
- `vite.config.ts` — Vue, Tailwind, manifest, service worker, and deployment-base configuration.
- `vitest.config.ts` and `playwright.config.ts` — coverage and browser-test configuration.
- `README.md`, `ARCHITECTURE.md`, `PRIVACY.md`, and `TESTING.md` — required product, architecture, privacy, and release documentation.
- `.github/workflows/ci-pages.yml` — verification and GitHub Pages deployment.

Do not edit generated output in `dist/`, `dev-dist/`, `coverage/`, `playwright-report/`, or `test-results/`.

## Architecture and coding conventions

- Use Vue 3 Composition API and TypeScript. Keep browser-specific media calls behind `MediaCapturePort`; do not call `getUserMedia` or `MediaRecorder` directly from UI components.
- Keep `App.vue` focused on rendering and DOM/video-element interaction. Session transitions, storage, errors, timers, and cleanup belong in the recorder composable.
- Prefer stable standard browser features. Feature-detect media APIs and test behavior in both WebKit and Chromium.
- Use the `@/` alias for imports from `src/`.
- Use shadcn-vue conventions and existing UI primitives for controls. Use Lucide icons already provided by `@lucide/vue`.
- Preserve accessible names, visible focus states, keyboard behavior, polite status announcements, and touch targets of at least 44×44 CSS pixels.
- Preserve portrait-first, full-viewport layout and `env(safe-area-inset-*)` handling. Check compact landscape layouts when changing bottom controls.
- The front camera and its review are mirrored. Rear-camera video uses its natural orientation. Camera switching is unavailable during recording.
- Keep the product name **Behind You** in UI, metadata, code, tests, workflow labels, and documentation. The legacy privacy-storage key used by the one-time migration is the only allowed obsolete-brand identifier.
- Follow the existing Prettier and ESLint configuration. Avoid unrelated formatting or dependency changes.

## Privacy, storage, and offline invariants

These requirements are release blockers:

- Never request microphone access. Camera constraints must keep `audio: false`.
- Never send media, frames, thumbnails, object URLs, device identifiers, or usage events over the network.
- Never persist media in Local Storage, IndexedDB, Cache Storage, the file system, or the photo library.
- Keep at most one take. Delete the prior take before a new recording, revoke object URLs, release Blob references, and stop all tracks.
- Cleanup must remain idempotent across Delete, New take, `visibilitychange`, `pagehide`, component unmount, errors, and overlapping async camera requests.
- Local Storage may contain only the privacy-intro boolean and the `user|environment` camera preference. Do not persist a hardware `deviceId`.
- The service worker may cache only static application assets. Do not add runtime caching, background sync, remote fonts, analytics, or third-party runtime requests.
- Keep the Content Security Policy restrictive and the app deployable as static files.
- Camera access on physical phones requires trusted HTTPS. An HTTP LAN address is not a valid phone-camera test environment.

## Testing requirements

Run focused tests while developing, then run the complete gate before handing off a change:

```sh
npm run format:check
npm test
```

`npm test` runs type checking, lint, Vitest coverage, a production build, and Playwright E2E tests.

- Vitest coverage must remain at or above 90% independently for statements, branches, functions, and lines. Do not exclude first-party behavior merely to satisfy the threshold.
- Add unit tests for state transitions, constraints, errors, storage migration, cleanup, timers, and stale async results.
- Add component tests for rendered states, accessible labels, controls, mirroring, and destructive actions.
- Add Playwright coverage for every main user workflow in both mobile Chromium and mobile WebKit. Extend `tests/e2e/media-mock.ts` instead of relying on a real camera in CI.
- Preserve the E2E assertion that all runtime HTTP requests are same-origin GETs and contain no media upload.
- Chromium-only service-worker inspection may remain skipped in WebKit; all other applicable flows should run in both projects.
- For camera, installation, safe-area, and offline-release changes, update and execute the physical-device checklist in `TESTING.md` on iPhone Safari and Android Chrome.

## Documentation and release discipline

- Documentation is mandatory. Update `README.md` for user/developer workflow changes, `ARCHITECTURE.md` and its C4 Mermaid diagrams for structural or data-flow changes, `PRIVACY.md` for any storage/network/media change, and `TESTING.md` for assurance or device-test changes.
- Keep PWA metadata in `vite.config.ts`, Apple metadata in `index.html`, package metadata, UI copy, and documentation consistent.
- Build locally with the root base path; GitHub Pages sets `VITE_BASE_PATH=/behindyou/`. Test both assumptions when changing asset URLs, manifest fields, navigation, or service-worker behavior.
- Do not commit generated artifacts or secrets, including local HTTPS certificates under `.cert/`.
- Preserve unrelated user changes in a dirty worktree. Stage only files that belong to the requested change.
- Do not create commits, tags, releases, or pushes unless the user explicitly requests them.
