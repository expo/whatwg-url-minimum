import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'react-native': fileURLToPath(
        new URL('./src/__tests__/fixtures/react-native.ts', import.meta.url)
      ),
    },
  },
});
