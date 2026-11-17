import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { host: 'localhost', port: 5173, strictPort: true },
  test: { environment: 'jsdom' },
})
