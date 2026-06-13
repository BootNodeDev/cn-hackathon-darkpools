export default {
  '{backend,frontend,canton-connect-kit}/**/*.{ts,tsx,js,jsx,json,jsonc,mjs,cjs,css}':
    'biome check --write --no-errors-on-unmatched',
}
