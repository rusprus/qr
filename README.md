# QR Transfer

Vue 3 web app that transfers text between two phones optically:

1. **Show QR** — splits the message into frames and displays a new QR every second.
2. **Scan camera** — reads those frames with the phone camera and reassembles the text.

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
