# Behind You Architecture

## Overview

Behind You is a static Vue single-page PWA. There is no application server or database. Vue coordinates a browser-media adapter, an in-memory recording session, and a full-screen mobile interface. A service worker precaches only versioned application assets.

The architecture favors widely supported browser APIs: `getUserMedia`, `MediaRecorder`, `Blob`, object URLs, HTML video, the Page Visibility API, service workers, and the Web App Manifest.

## C4 context

```mermaid
C4Context
  title Behind You — System Context
  Person(user, "Behind You user", "Records and reviews one temporary hair-check video")
  System(behindYou, "Behind You PWA", "Captures and reviews video locally in browser memory")
  System_Ext(githubPages, "GitHub Pages", "Serves versioned static app assets over HTTPS")

  Rel(user, behindYou, "Uses on iPhone Safari or Android Chrome")
  Rel(behindYou, githubPages, "Downloads app shell on first load and updates", "HTTPS GET")
```

The recording has no relationship to GitHub Pages: it never crosses the browser boundary.

## C4 containers

```mermaid
C4Container
  title Behind You — Containers
  Person(user, "User")
  System_Boundary(pwa, "Installed/browser PWA") {
    Container(ui, "Vue UI", "Vue 3 + shadcn-vue", "Privacy intro, camera view, controls, and review")
    Container(session, "Recording Session", "Vue composable", "State machine, timing, disposal, and errors")
    Container(media, "Browser Media Adapter", "TypeScript", "getUserMedia and MediaRecorder boundary")
    Container(sw, "Service Worker", "Workbox", "Precaches static application shell only")
    ContainerDb(memory, "Transient browser memory", "MediaStream / Blob / object URL", "At most one take; never persisted")
    ContainerDb(cache, "App Cache", "Cache Storage", "HTML, JS, CSS, manifest, and icons only")
  }
  System_Ext(pages, "GitHub Pages", "Static hosting")

  Rel(user, ui, "Taps and scrubs")
  Rel(ui, session, "Invokes session commands")
  Rel(session, media, "Opens, records, stops, disposes")
  Rel(media, memory, "Creates transient media")
  Rel(sw, pages, "Fetches static assets", "HTTPS GET")
  Rel(sw, cache, "Precaches app shell")
```

## C4 components

```mermaid
C4Component
  title Behind You — Vue Application Components
  Container_Boundary(app, "Vue application") {
    Component(appView, "App View", "App.vue", "Renders the state-specific mobile interface")
    Component(button, "Button", "shadcn-vue convention", "Accessible primary and destructive actions")
    Component(slider, "Slider", "shadcn-vue / Reka UI", "Touch and keyboard video seeking")
    Component(composable, "Behind You Recorder", "useBehindYouRecorder", "Session state machine, camera preference, and resource ownership")
    Component(adapter, "Browser Media Capture", "MediaCapturePort", "Feature detection and MediaRecorder events")
    Component(lifecycle, "Lifecycle Cleanup", "visibilitychange + pagehide", "Disposes media when hidden or closed")
  }

  Rel(appView, button, "Uses")
  Rel(appView, slider, "Uses")
  Rel(appView, composable, "Reads state and sends commands")
  Rel(composable, adapter, "Uses through interface")
  Rel(lifecycle, composable, "Triggers idempotent cleanup")
```

## Session state and media lifecycle

```mermaid
stateDiagram-v2
  [*] --> intro
  intro --> requesting_permission: Open/start camera
  requesting_permission --> live: Camera stream ready
  requesting_permission --> live: Preferred camera unavailable; selfie restored
  requesting_permission --> error: Permission/device failure
  live --> recording: Start
  live --> switching_camera: Switch front/rear
  switching_camera --> live: Requested or previous camera ready
  switching_camera --> error: Request and restoration fail
  recording --> finalizing: Stop or 60-second timeout
  finalizing --> review: Blob and object URL ready
  finalizing --> error: Encoding failure
  review --> requesting_permission: New take
  review --> intro: Delete
  error --> requesting_permission: Retry
  live --> intro: Hidden/pagehide
  recording --> intro: Hidden/pagehide
  review --> intro: Hidden/pagehide
```

```mermaid
sequenceDiagram
  actor User
  participant UI as Vue UI
  participant Session as Hair Recorder
  participant Media as Browser Media APIs
  participant RAM as Transient memory

  User->>UI: Switch front/rear camera
  UI->>Session: switchCamera()
  Session->>Media: Stop tracks and getUserMedia(facingMode)
  Media-->>Session: Replacement MediaStream

  User->>UI: Tap record
  UI->>Session: startRecording()
  Session->>Media: MediaRecorder.start(1000)
  Media-->>RAM: In-memory Blob chunks
  User->>UI: Tap stop
  UI->>Session: stopRecording()
  Session->>Media: MediaRecorder.stop()
  Media-->>Session: Final Blob
  Session->>RAM: Create object URL
  Session-->>UI: Review state
  User->>UI: Scrub and delete
  UI->>Session: deleteTake()
  Session->>RAM: Revoke URL and release Blob/chunks
```

## Privacy and data flow

```mermaid
flowchart LR
  Camera[Front or rear camera frames] --> Stream[MediaStream in RAM]
  Stream --> Recorder[MediaRecorder]
  Recorder --> Blob[One temporary Blob]
  Blob --> Video[Local object URL and video element]
  Video --> Dispose[Revoke URL and release references]
  Dispose --> GC[Browser reclaims memory]

  Shell[Static app shell] --> Cache[(Cache Storage)]
  Preference[Intro seen: true] --> Local[(Local Storage)]

  Blob -. never .-> Cache
  Blob -. never .-> Local
  Blob -. never .-> Network[Network]
```

Only `behind-you:privacy-intro-seen:v1=true` and `behind-you:camera-facing:v1=user|environment` persist. No timestamp, identity, device ID, usage count, frame, thumbnail, audio, or video is stored. A legacy privacy preference is migrated once and its obsolete key is removed.

## Compatibility and failure handling

- Camera access is available only on HTTPS or localhost and always remains subject to browser permission.
- The default selfie request uses an ideal `facingMode`; explicit switching uses an exact front/rear constraint so the browser cannot silently return the wrong lens.
- If an exact lens is unavailable, the adapter reopens the previous working camera. Front footage is mirrored in the UI and rear footage retains its natural orientation.
- Media MIME types are selected with `MediaRecorder.isTypeSupported`, preferring MP4/H.264 and falling back to WebM/VP8 or the browser default.
- The same browser records and plays a take, avoiding cross-device codec transfer concerns.
- Recorder time slices are not used as a clock. A monotonic timer controls the 60-second maximum.
- Permission denial, no camera, busy camera, unsupported APIs, and encoding errors map to user-actionable error states.
- Cleanup is idempotent because `visibilitychange`, `pagehide`, component unmount, and user actions can overlap.

## Offline and update model

`vite-plugin-pwa` generates the manifest and Workbox service worker. Its precache glob includes only HTML, JavaScript, CSS, SVG, and the web manifest. There is no runtime cache and no path that sends `blob:` media to the worker. A new service worker waits until existing app clients close, preventing an update from interrupting a session.

## Deferred low-light enhancement

The optional low-light frame is intentionally outside version one. A later implementation may sample very small, downscaled frames with `requestVideoFrameCallback`, compute luminance locally, immediately clear the canvas, and display a bright border below a calibrated threshold. It must not retain frames, introduce a new permission, or change the no-network guarantee.
