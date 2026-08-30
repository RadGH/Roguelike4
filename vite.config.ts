import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is './' so the built site works from any path (GitHub Pages subpath included).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
