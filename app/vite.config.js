import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),plugins:[react()],publicDir:'public',server:{fs:{deny:['**/.env*','**/.git/**','**/data/**','**/*.sqlite*','**/server.mjs','**/store.mjs']}},build:{outDir:'dist',emptyOutDir:true}});
