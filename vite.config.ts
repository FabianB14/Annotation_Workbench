import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env variables. A build-time GEMINI_API_KEY can be baked in, but the
  // app also lets the user paste their own key at runtime (stored in the browser).
  const env = loadEnv(mode, process.cwd(), '');
  // Base path for asset URLs. GitHub Pages serves project sites under
  // /<repo>/, so the deploy workflow passes VITE_BASE=/<repo>/. Falls back to
  // this repo's name for a manual production build, and '/' for local dev.
  const base =
    process.env.VITE_BASE || (mode === 'production' ? '/Annotation_Workbench/' : '/');
  return {
    base,
    plugins: [react()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
    },
    server: {
      host: true,
      port: 5173,
    },
  };
});
