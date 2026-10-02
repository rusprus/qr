# QR Transfer

Vue 3 web app that transfers text, small files, or short voice notes between two phones optically:

1. **Show QR** — splits text/file into frames and displays a new QR every second.
2. **Scan camera** — reads those frames with the phone camera and reassembles the payload (download for files).

## Local development

```bash
npm install
npm run dev -- --host
```

Open the URL on two phones on the same network. Camera access usually needs HTTPS — use the GitHub Pages URL for reliable scanning.

## Build

```bash
npm run build
```

Deployed via GitHub Pages from the `dist` folder (`base: /qr/`).

## Settings

Presets for optical reliability vs speed:

- **Reliable** — 1 fps, 90 B/frame
- **Balanced** — ~3 fps, 120 B/frame
- **Fast** — 5 fps, 150 B/frame (may miss frames on some phones)

Custom frame rate, chunk size and max file size are stored in `localStorage`.
