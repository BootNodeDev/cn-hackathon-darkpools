# Carpincho Wallet (pre-built)

Pre-built distribution of the [Carpincho](https://github.com/BootNodeDev/carpincho) browser extension.

Carpincho is a Canton Network browser wallet. It implements the CIP-0103 injected provider, so any dApp using `canton-connect-kit` connects to it automatically.

```text
frontend (dApp)  ->  CIP-0103 injected provider  ->  Carpincho  ->  Canton participant
```

## Loading the extension

### Unpacked (development / demo)

1. Download the .zip file and extract it.
2. Open `chrome://extensions/` (or `brave://extensions/`).
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the extracted folder.

The Carpincho icon should appear in your browser toolbar.

## Connecting to the dApp

1. Start the frontend dev server (`npm run app:dev` from the repo root) or browse to https://darkpools.cc/
2. Open http://localhost:3012.
3. Click **Connect Carpincho** in the app header.
4. Approve the connection request in the Carpincho popup.

## Configuration

After loading the extension, open Carpincho and go to **Settings** to configure:

- **Network**: set to `canton:localnet` for local development, or point it at the Canton node you connect to.
