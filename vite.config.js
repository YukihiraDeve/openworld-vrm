import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.fbx', '**/*.obj', '**/*.mtl', '**/*.vrm', '**/*.png'], // Ajouter PNG aux assets reconnus
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  }
}) 