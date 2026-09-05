import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

/** Standalone public-repository config; no ChatGPT Sites project binding. */
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    watch: {
      ignored: ['**/outputs/**', '**/work/**'],
    },
  },
  plugins: [vinext()],
});
