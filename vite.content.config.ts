// Passe 2 du build : le content script, émis en IIFE autonome (dist/content.js).
// Un content script MV3 déclaré au manifest est un script « classique » : un import
// statique y lèverait une SyntaxError, d'où le format iife et l'inlining des imports.
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // ne pas écraser la passe 1 (popup + worker)
    lib: {
      entry: 'src/content/inject.ts',
      name: 'CouponContentScript',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
