import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    hmr: {
      overlay: false  // Desactiva el overlay de errores
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
