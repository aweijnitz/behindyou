# Hair Checker

Hair Checker is a private, offline-first progressive web app for recording one short selfie-camera video, checking the sides and back of your hair, and immediately discarding the take.

The recording is silent and exists only as an in-memory browser `Blob`. The app has no backend, account, analytics, upload, download, or sharing feature.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- A current desktop browser for development
- iOS 17+ Safari or a current Android Chrome device for final camera testing
- HTTPS when testing a physical device; browsers permit camera capture only in a secure context (`localhost` is also accepted for desktop development)

## Getting started

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. On first use, accept the privacy explanation and grant camera permission. The microphone is never requested.

`http://localhost` works for desktop development because browsers treat localhost as a secure context. A phone opening Vite through a LAN address such as `http://192.168.2.85:5173` is **not** in a secure context, so the browser blocks camera access before it can show a permission prompt.

Useful commands:

```sh
npm run type-check
npm run dev:https
npm run lint
npm run format:check
npm run test:unit
npm run test:coverage
npm run test:e2e:install
npm run test:e2e
npm run build
npm run preview
npm test
```

## How to use it

1. Open Hair Checker and tap **Open camera** on first use.
2. Frame your head in the mirrored front-camera view.
3. Tap the large red record button and slowly turn from side to side.
4. Tap stop, or let the app stop automatically at 60 seconds.
5. Play the take or drag the timeline backward and forward.
6. Tap **Delete** to discard it immediately, or **New take** to discard it and record again.

Leaving or backgrounding the app stops the camera and disposes of the current take. Returning requires a tap before the camera restarts.

## Building and local production preview

```sh
npm run build
npm run preview
```

The static production bundle is written to `dist/`. It contains the application shell and service worker, never a recording.

To test on a phone before deployment, serve `dist/` from a host with a trusted HTTPS certificate and open that URL on the device. An HTTP LAN address is not sufficient for camera access.

## Testing on physical phones

The simplest and most representative option is to deploy to GitHub Pages and test its HTTPS URL. This also exercises the production build, service worker, installation, and offline cache.

For live-reload testing entirely on the local Wi-Fi network, create a locally trusted certificate with [`mkcert`](https://github.com/FiloSottile/mkcert):

```sh
brew install mkcert
mkcert -install
mkdir -p .cert
mkcert -key-file .cert/key.pem -cert-file .cert/cert.pem localhost 127.0.0.1 ::1 192.168.2.85
npm run dev:https
```

Replace `192.168.2.85` if the laptop’s Wi-Fi address changes. Then install and trust the `rootCA.pem` from the directory printed by `mkcert -CAROOT` on each test phone. Never copy `rootCA-key.pem`, and never commit anything from `.cert/`.

- **iPhone:** transfer `rootCA.pem` to the phone, install the downloaded profile in Settings, then go to **Settings → General → About → Certificate Trust Settings** and enable full trust for that root certificate.
- **Android:** install `rootCA.pem` as a CA certificate from the device’s security or credential settings. Menu names differ by Android vendor and version.

With the phone and laptop on the same Wi-Fi, open `https://192.168.2.85:5173/`. Confirm that the address is HTTPS without a certificate warning before testing the camera. Remove the development CA from the phones when local testing is complete.

The PWA plugin is intentionally disabled during `vite` development. This avoids stale development caches and removes the empty `dev-dist` glob warning. Test offline and installation behavior using the GitHub Pages deployment or another HTTPS-served production build.

## Installing the PWA

The first visit must be online so the application shell can be cached.

- **iPhone:** open the deployed site in Safari, use **Share → Add to Home Screen**, then launch the new Hair Check icon.
- **Android:** open the site in Chrome and choose **Install app** or **Add to Home screen** from Chrome’s menu/install prompt.

After the first successful load, close the page, enable airplane mode, and relaunch the installed app to verify offline operation.

## Deploying to GitHub Pages

The workflow in `.github/workflows/ci-pages.yml` verifies and deploys the site after pushes to `main`.

1. Push the repository to GitHub using the repository name `hair-checker`.
2. In **Settings → Pages**, select **GitHub Actions** as the source.
3. Push to `main` or run the workflow manually.
4. Open the deployment URL reported by the `github-pages` environment.

The deployment workflow sets `VITE_BASE_PATH=/hair-checker/` for the Vite, manifest, start URL, scope, and service-worker base path. If the repository is renamed, update that workflow value before deploying.

GitHub Pages provides HTTPS. It may process normal web-hosting request metadata under GitHub’s own policies; the Hair Checker application does not collect or transmit personal or usage data.

## Updating the app

Updates are downloaded as static application assets. The service worker uses a prompt/waiting lifecycle so a newly downloaded version cannot take over in the middle of an active recording. Close all Hair Checker windows and launch it again to activate a waiting update.

## Troubleshooting

- **Camera permission denied:** allow camera access for the site in Safari/Chrome settings and tap **Try again**.
- **Camera busy:** close camera, video-call, or social apps that may be using it.
- **No install option:** confirm the site is deployed over HTTPS and the manifest/service worker load without errors.
- **Offline launch fails:** reconnect once, load the app fully, close it, and retry offline.
- **Review does not play:** update Safari/Chrome. Media format selection is feature-detected for the recording browser.

See [ARCHITECTURE.md](ARCHITECTURE.md), [PRIVACY.md](PRIVACY.md), and [TESTING.md](TESTING.md) for implementation and assurance details.
