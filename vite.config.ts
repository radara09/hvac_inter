import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from '@tailwindcss/vite';
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  server: {
	  allowedHosts: [".ngrok-free.app"],
  },
  plugins: [react(), cloudflare(), tailwindcss()],
  resolve: {
    alias: {
      "@imagekit/react": path.resolve(__dirname, "src/lib/imagekit-react.tsx"),
    },
  },
})
