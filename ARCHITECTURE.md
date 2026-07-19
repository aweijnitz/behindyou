# Hair Checker Architecture

## Overview

Hair Checker is a static Vue single-page PWA. There is no application server or database. Vue coordinates a browser-media adapter, an in-memory recording session, and a full-screen mobile interface. A service worker precaches only versioned application assets.

The architecture favors widely supported browser APIs: `getUserMedia`, `MediaRecorder`, `Blob`, object URLs, HTML video, the Page Visibility API, service workers, and the Web App Manifest.

## C4 context

```mermaid
C4Context
  title Hair Checker — System Context
  Person(user, "Hair Checker user", "Records and reviews one temporary hair-check video")
  System(hairChecker, "Hair Checker PWA", "Captures and reviews video locally in browser memory")
  System_Ext(githubPages, "GitHub Pages", "Serves versioned static app assets over HTTPS")

  Rel(user, hairChecker, "Uses on iPhone Safari or Android Chrome")
  Rel(hairChecker, githubPages, "Downloads app shell on first load and updates", "HTTPS GET")
```

The recording has no relationship to GitHub Pages: it never crosses the browser boundary.

## C4 containers

```mermaid
C4Container
  title Hair Checker — Containers
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
  title Hair Checker — Vue Application Components
  Container_Boundary(app, "Vue application") {
    Component(appView, "App View", "App.vue", "Renders the state-specific mobile interface")
    Component(button, "Button", "shadcn-vue convention", "Accessible primary and destructive actions")
    Component(slider, "Slider", "shadcn-vue / Reka UI", "Touch and keyboard video seeking")
    Component(composable, "Hair Recorder", "useHairRecorder", "Session state machine and resource ownership")
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
  requesting_permission --> error: Permission/device failure
  live --> recording: Start
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
  Camera[Front camera frames] --> Stream[MediaStream in RAM]
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

Only the `hair-checker:privacy-intro-seen:v1=true` preference persists. No timestamp, identity, device value, usage count, frame, thumbnail, audio, or video is stored.

## Compatibility and failure handling

- Camera access is available only on HTTPS or localhost and always remains subject to browser permission.
- Media MIME types are selected with `MediaRecorder.isTypeSupported`, preferring MP4/H.264 and falling back to WebM/VP8 or the browser default.
- The same browser records and plays a take, avoiding cross-device codec transfer concerns.
- Recorder time slices are not used as a clock. A monotonic timer controls the 60-second maximum.
- Permission denial, no camera, busy camera, unsupported APIs, and encoding errors map to user-actionable error states.
- Cleanup is idempotent because `visibilitychange`, `pagehide`, component unmount, and user actions can overlap.

## Offline and update model

`vite-plugin-pwa` generates the manifest and Workbox service worker. Its precache glob includes only HTML, JavaScript, CSS, SVG, and the web manifest. There is no runtime cache and no path that sends `blob:` media to the worker. A new service worker waits until existing app clients close, preventing an update from interrupting a session.

## Deferred low-light enhancement

The optional low-light frame is intentionally outside version one. A later implementation may sample very small, downscaled frames with `requestVideoFrameCallback`, compute luminance locally, immediately clear the canvas, and display a bright border below a calibrated threshold. It must not retain frames, introduce a new permission, or change the no-network guarantee.
