# Testing and Release Assurance

## Automated checks

Run the complete local pipeline with:

```sh
npm test
```

Individual checks are available through `npm run type-check`, `npm run lint`, `npm run format:check`, `npm run test:coverage`, `npm run build-only`, and `npm run test:e2e`.

## Unit and component strategy

Vitest runs in jsdom. Browser camera, track, MediaRecorder, Blob-event, timer, object-URL, video, and visibility behavior are injected or stubbed. Tests cover:

- Silent front/rear camera constraints, switching fallback, and MIME fallback.
- Opening, starting, stopping, chunk assembly, and track shutdown.
- Privacy preference migration plus persisted front/rear camera selection.
- Valid state transitions and stale permission-result rejection.
- Manual and automatic stop, errors, deletion, retake, background cleanup, and unmount.
- Duration formatting and actionable browser error classification.
- The complete component workflow from privacy intro through review and deletion.
- Dynamic switch labels, recording-time hiding, and front/rear mirroring in live and review modes.

V8 coverage includes all first-party TypeScript and Vue source except the bootstrap entry and locally generated shadcn-vue primitives. Statements, branches, functions, and lines each have a hard 90% threshold. Generated UI primitives are exercised through component and E2E tests.

## End-to-end strategy

Playwright runs mobile Chromium and mobile WebKit projects. An initialization script supplies a deterministic `getUserMedia` stream and MediaRecorder, validates `audio: false`, and counts recording and track-stop operations. The suite covers:

- Record, review, seek, play, and delete.
- Retake and camera reacquisition.
- Front/rear switching, unavailable-camera restoration, preference persistence, and orientation-aware review.
- Visibility cleanup.
- Permission denial and retry.
- Absence of uploads and third-party requests.
- Manifest values and an offline cached reload in Chromium.

Playwright WebKit is not physical iOS Safari, and Playwright service-worker inspection is Chromium-only. The real-device gate below is mandatory.

## Real-device release checklist

Test the production GitHub Pages URL, not a development HTTP LAN address.

### iPhone — iOS 17 or later

- [ ] Open in Safari and add to the Home Screen.
- [ ] First-run privacy text is readable and camera permission appears only after a tap.
- [ ] No microphone permission appears and iOS shows only camera use.
- [ ] The front preview fills the viewport, is mirrored, and respects safe areas.
- [ ] Switch to the rear lens and back; confirm the physical lens changes, the switch label updates, and only the front view is mirrored.
- [ ] Record and review with both lenses; confirm each review retains the correct orientation.
- [ ] Confirm the switch control disappears while recording and returns in live preview.
- [ ] Relaunch and confirm the last camera selection is reused; make a requested lens unavailable where practical and confirm the prior camera is restored with an accessible notice.
- [ ] Record manually and allow a second recording to auto-stop at 60 seconds.
- [ ] Playback works and the timeline seeks smoothly in both directions.
- [ ] Delete immediately removes the take; New take removes it and reacquires the camera.
- [ ] Switch apps while live, recording, and reviewing; returning shows the camera-off screen and no take.
- [ ] Force-close and relaunch; no previous take exists.
- [ ] Load online once, force-close, enable airplane mode, and successfully relaunch/record/review/delete.
- [ ] Test permission denied, permission restored in Settings, and retry.

### Android — current and previous two Chrome major versions

- [ ] Install from Chrome and launch in standalone mode.
- [ ] Repeat every capture, review, cleanup, offline, and permission check above.
- [ ] Lock the screen while recording and confirm the session is discarded on return.
- [ ] Confirm Back/navigation disposes camera and take.

### Privacy/network audit

- [ ] Inspect production network traffic through a trusted debugging proxy or remote browser tools.
- [ ] Confirm all app requests are same-origin static GETs.
- [ ] Confirm no request body, media Blob, analytics domain, remote font, WebSocket, or background sync.
- [ ] Inspect Local Storage, IndexedDB, and Cache Storage; only the intro boolean, `user|environment` camera preference, and static shell may persist.

Record device model, OS/browser version, test date, and tester with the release notes. Do not record or attach a real user’s hair-check video as evidence.
