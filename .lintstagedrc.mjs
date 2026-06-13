export default {
  '{backend,frontend}/**/*.{ts,tsx,js,jsx,json,jsonc,mjs,cjs,css}':
    'biome check --write --no-errors-on-unmatched',
}
