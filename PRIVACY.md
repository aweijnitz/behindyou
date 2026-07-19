# Privacy

Behind You is designed to perform its job without collecting personal data.

## What the application uses

- Front- or rear-camera video while the app is visible and the camera session is active.
- Temporary browser memory for one silent recording of at most 60 seconds.
- One local boolean, `behind-you:privacy-intro-seen:v1=true`, to remember that the privacy introduction has been seen. Existing installations migrate their previous preference and remove the obsolete key.
- One local value, `behind-you:camera-facing:v1`, containing only `user` or `environment` to remember the preferred camera.
- Cache Storage for static application files needed to work offline: HTML, JavaScript, CSS, the manifest, and icons.

## What the application does not do

- It never requests the microphone or records audio.
- It does not upload, download, share, export, log, analyze, or retain video.
- It does not create thumbnails or write media to Local Storage, IndexedDB, Cache Storage, or the device photo library.
- It has no account, backend, analytics, advertising, tracking pixel, remote font, cookie, or third-party runtime request.

## Deletion behavior

Delete, New take, backgrounding, navigation, page close, and component teardown all use the same cleanup operation. That operation stops camera tracks and recording, clears chunks, pauses and clears playback, revokes the object URL, and releases the Blob reference.

Web applications cannot command a device to physically overwrite RAM or prove exactly when a browser garbage collector reclaims it. Behind You instead ensures that it never creates a persistent media copy and retains no reference after cleanup. Browser termination also discards the session memory.

## Hosting boundary

The initial visit and later application updates download static files from GitHub Pages. GitHub may process ordinary request information such as IP address and user agent under its own privacy terms. No recording is included in those requests, and Behind You does not add application analytics or usage reporting.
