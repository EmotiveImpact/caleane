// Standalone Vite build; no dependency on the NAY website checkout.
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
await build({configFile:fileURLToPath(new URL('./vite.config.js',import.meta.url))});
