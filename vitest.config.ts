// Tests unitaires : environnement Node par défaut ; les tests qui manipulent le DOM
// (détection des champs coupon) déclarent « @vitest-environment jsdom » en tête de fichier.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
