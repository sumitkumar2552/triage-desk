import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxying means the browser only ever talks to one origin in development,
    // so there are no CORS surprises when you deploy behind a single domain.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
