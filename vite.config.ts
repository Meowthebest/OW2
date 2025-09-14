import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/OW2/', // repo name so GitHub Pages loads assets correctly
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
