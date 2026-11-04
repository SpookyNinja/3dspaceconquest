import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages (/<repo>/) and itch.io (iframe in a random folder).
export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsDir: 'bundle', chunkSizeWarningLimit: 8000 },
});
