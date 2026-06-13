// Registers the extensionless-import resolver via the stable module API.
// Replaces the deprecated --experimental-loader flag (node --import this).
import { register } from 'node:module'

register('./ts-resolver.mjs', import.meta.url)
