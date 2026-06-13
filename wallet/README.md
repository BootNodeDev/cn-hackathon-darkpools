# Carpincho Wallet (pre-built)

Pre-built distribution of the [Carpincho](https://github.com/BootNodeDev/carpincho) browser extension. Source lives in the upstream repo; this folder contains the ready-to-load unpacked build.

Carpincho is a Canton Network browser wallet. It implements the CIP-0103 injected provider, so any dApp using `canton-connect-kit` connects to it automatically. It also supports WalletConnect as a fallback.

```text
frontend (dApp)  ->  CIP-0103 injected provider  ->  Carpincho  ->  Canton participant
```

## Loading the extension

### Unpacked (development / demo)

1. Open `chrome://extensions/` (or `brave://extensions/`).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select this folder's `dist-extension/` directory.

The Carpincho icon should appear in your browser toolbar.

### From the zip

`dist-extension.zip` is the same build packaged for distribution. Unzip it and follow the unpacked steps above, or submit it directly to the Chrome Web Store if publishing.

## Connecting to the dApp

1. Start the frontend dev server (`npm run app:dev` from the repo root).
2. Open http://localhost:3012.
3. Click **Connect Carpincho** in the app header.
4. Approve the connection request in the Carpincho popup.

## Configuration

After loading the extension, open Carpincho and go to **Settings** to configure:

- **Network** -- set to `canton:localnet` for local development (Canton Node endpoint).
- **Wallet companion URL** -- the wallet-service URL if using the full local stack.
- **WalletConnect Project ID** -- only required for WalletConnect fallback (optional).

For full local stack setup (validator, wallet-service, Canton node), see the root [`README.md`](../README.md).

## Rebuilding

The source lives at [BootNodeDev/cn-dappbooster (darkpool branch)](https://github.com/BootNodeDev/cn-dappbooster/tree/darkpool/carpincho-wallet). To rebuild from source, clone that repo and run:

```bash
npm install
npm run carpincho:build:extension
```

The output will be in `carpincho-wallet/dist-extension/`.
