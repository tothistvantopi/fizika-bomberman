import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// `vite build --mode demo`: static, browser-only build (games against bots, no server needed)
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [react(), tailwindcss()],
    define: { 'import.meta.env.VITE_DEMO': JSON.stringify(demo ? '1' : '') },
    build: { outDir: demo ? 'dist-demo' : 'dist' },
    resolve: {
      alias: [
        { find: '@', replacement: root },
        ...(demo
          ? [
              { find: /^\.\/net\/client\.js$/, replacement: path.join(root, 'src/net/local.ts') },
              { find: /^ws$/, replacement: path.join(root, 'src/net/ws-shim.ts') },
            ]
          : []),
      ],
    },
  };
});
