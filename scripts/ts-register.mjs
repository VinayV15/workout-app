// Installs the resolve hook in scripts/ts-hooks.mjs. Loaded via `node --import`.
import { register } from 'node:module'
register('./ts-hooks.mjs', import.meta.url)
