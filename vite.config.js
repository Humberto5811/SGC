import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    hmr: {
      overlay: false  // Desactiva el overlay de errores
    },
    proxy: {
      // Redirige las llamadas /api al backend Express
      '/api': {
        target: 'http://217.216.54.68',
        changeOrigin: true,
        secure: false
      }
    }
  },
  optimizeDeps: {
    entries: []  // No escanear dependencias
  },
  esbuild: {
    jsx: 'transform',  // Transformar JSX
    jsxFactory: 'h',
    jsxFragment: 'Fragment'
  }
});
