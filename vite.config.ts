// Passe 1 du build : popup React (index.html) + service worker (worker.js), tous deux en ESM.
// Le content script est compilé séparément en IIFE par vite.content.config.ts,
// car les content scripts déclarés dans un manifest MV3 ne peuvent pas être des modules ES.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'index.html',
        worker: 'src/background/worker.ts',
      },
      output: {
        // Le manifest référence "worker.js" : on fige le nom des points d'entrée à la racine.
        entryFileNames: (chunk) => (chunk.name === 'worker' ? 'worker.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
