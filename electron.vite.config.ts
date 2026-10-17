import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { external: ['better-sqlite3', 'discord-rpc'] } }
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { base: './', plugins: [react()] }
})
