# registry-token: build and deploy

`registry-token` is the production minimal token registry the dark pool trades.
It is a standalone Daml package (no daml-script in the DAR) whose DAR is uploaded
to the validator out of band, after which its package id and contract ids become
backend configuration.

## Build the DAR

    npm run build:registry-token

The DAR is written to `daml/registry-token/.daml/dist/registry-token-0.0.1.dar`.

## Upload (run once per validator)

Upload the DAR through the validator's package-management surface (Canton console
`participant.dars.upload`, or the JSON Ledger API package upload endpoint). The
exact transport is environment specific and is owned by the backend deliverable.

## Record the backend config

After upload, record:

- the `registry-token` package id (from the uploaded DAR);
- for each token admin, the contract id of its `Registry` (one `Registry` per
  admin party; create it once with `Registry with admin = <adminParty>`);
- the `InstrumentId`s the pools trade, each `InstrumentId { admin, id }` where
  `admin` is a token-admin party and `id` is the instrument symbol.

The backend exercises `Mint` (faucet), `AllocationFactory_Allocate`, and
`TransferFactory_Transfer` on the `Registry` as the admin, and reads holdings by
the `RegistryToken.Holding:RegistryHolding` template. All choice contexts are
`emptyExtraArgs`, so no external Scan or choice-context service is needed.

## Visibility note (cross-participant callers)

The `Registry` is admin-signed, so the `AllocationFactory` / `TransferFactory`
instances it hosts are too. A sender exercising `AllocationFactory_Allocate` or
`TransferFactory_Transfer` from a different participant must receive the
`Registry` contract as a disclosed contract (its bytes attached to the command);
the tests model this via `registryDisc` / `submitWithDisclosures'`. When the
sender is co-hosted on the same participant as the admin this is a non-issue, but
a cross-participant backend must thread the disclosure through.
