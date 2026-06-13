// Resolved config = the bootstrap.json the ledger bootstrap emitted + env. In
// mock mode the service runs against an in-memory ledger with a seeded fixture,
// so it needs no live Canton and no real token.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { M2mAuthConfig } from './auth.ts'
import type { InstrumentId } from './types.ts'

export type AuthSource = 'static' | 'm2m' | 'mock'

export interface BootstrapConfig {
  jsonApiUrl?: string
  parties: { venue: string; admin: string }
  poolId: string
  instruments: { base: InstrumentId; quote: InstrumentId }
  factoryCid: string
  poolCid: string
}

export interface Config extends Omit<BootstrapConfig, 'jsonApiUrl'> {
  jsonApiUrl: string
  port: number
  matchIntervalMs: number
  corsOrigins: string[]
  mock: boolean
  auth: { source: AuthSource; staticToken?: string; m2m?: M2mAuthConfig }
}

const DEFAULT_PORT = 3020
const DEFAULT_MATCH_INTERVAL_MS = 300_000
const TOKEN_REFRESH_SKEW_MS = 60_000
const MOCK_FIXTURE = fileURLToPath(new URL('./mock-bootstrap.json', import.meta.url))

// Reads an optional environment variable, treating empty values as unset so
// docker-compose defaults do not accidentally select an auth or URL mode.
const optional = (name: string): string | undefined => {
  const value = process.env[name]
  return value === undefined || value === '' ? undefined : value
}

// Parses positive integer knobs used by the process listener and matcher timer.
const positiveInt = (name: string, fallback: number): number => {
  const value = optional(name)
  if (value === undefined) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

// Enables the self-contained in-memory ledger used for local UI development.
const isMock = (): boolean => optional('DARK_POOL_MOCK') === '1'

// Loads the deployed contract identifiers emitted by the ledger bootstrap step.
const readBootstrap = (mock: boolean): BootstrapConfig => {
  const path =
    optional('DARK_POOL_BOOTSTRAP') ?? (mock ? MOCK_FIXTURE : 'daml/dark-pool.bootstrap.json')
  return JSON.parse(readFileSync(path, 'utf8')) as BootstrapConfig
}

// Resolves the JSON API endpoint from env first, with bootstrap fallback for
// legacy local files that already include the endpoint.
const resolveJsonApiUrl = (bootstrap: BootstrapConfig): string => {
  const jsonApiUrl = optional('CANTON_JSON_API_URL') ?? bootstrap.jsonApiUrl
  if (jsonApiUrl === undefined) {
    throw new Error('set CANTON_JSON_API_URL or jsonApiUrl in DARK_POOL_BOOTSTRAP')
  }
  return jsonApiUrl
}

// Static LocalNet token, FiveNorth M2M, or none (mock) — first match wins.
const resolveAuth = (mock: boolean): Config['auth'] => {
  if (mock) {
    return { source: 'mock' }
  }
  const staticTokenValue = optional('CANTON_BACKEND_TOKEN')
  if (staticTokenValue !== undefined) {
    return { source: 'static', staticToken: staticTokenValue }
  }
  const clientSecret = optional('FIVENORTH_CLIENT_SECRET')
  if (clientSecret === undefined) {
    throw new Error(
      'set CANTON_BACKEND_TOKEN (LocalNet), FIVENORTH_CLIENT_SECRET (M2M), or DARK_POOL_MOCK=1',
    )
  }
  return {
    source: 'm2m',
    m2m: {
      tokenUrl:
        optional('FIVENORTH_AUTH_URL') ?? 'https://auth.sandbox.fivenorth.io/application/o/token/',
      clientId: optional('FIVENORTH_CLIENT_ID') ?? 'validator-devnet-m2m',
      clientSecret,
      scope: optional('FIVENORTH_SCOPE') ?? 'daml_ledger_api',
      refreshSkewMs: TOKEN_REFRESH_SKEW_MS,
    },
  }
}

export const loadConfig = (): Config => {
  const mock = isMock()
  const bootstrap = readBootstrap(mock)
  return {
    ...bootstrap,
    jsonApiUrl: resolveJsonApiUrl(bootstrap),
    port: positiveInt('DARK_POOL_SERVICE_PORT', DEFAULT_PORT),
    matchIntervalMs: positiveInt('MATCH_INTERVAL_MS', DEFAULT_MATCH_INTERVAL_MS),
    corsOrigins: (optional('CORS_ORIGINS') ?? '*').split(',').map((origin) => origin.trim()),
    mock,
    auth: resolveAuth(mock),
  }
}
