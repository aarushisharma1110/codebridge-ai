import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import messages from '../lang/message/en/messages.json'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'app-title',
      transformIndexHtml: () => [{ tag: 'title', children: messages.brand.title, injectTo: 'head' }],
    },
  ],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL('../lang', import.meta.url))] },
  },
  test: { environment: 'jsdom' },
})
