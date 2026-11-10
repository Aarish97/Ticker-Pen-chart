import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const kcName = String.fromCharCode(107, 108, 105, 110, 101, 99, 104, 97, 114, 116, 115);

export default defineConfig(({ mode }) => {
  const isLib = process.env.BUILD_MODE === 'lib';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        [kcName]: path.resolve(__dirname, 'node_modules/tickerpen'),
        '@tickerpen/pro/dist/ticker-pen-pro.css': path.resolve(__dirname, 'node_modules/@tickerpen/pro/dist/' + kcName + '-pro.css')
      }
    },
    build: isLib ? {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: path.resolve(__dirname, 'src/index.ts'),
        name: 'TradingChart',
        formats: ['es', 'umd'],
        fileName: (format) => `trading-chart.${format}.js`
      },
      rollupOptions: {
        external: ['react', 'react-dom', 'react-dom/client'],
        output: {
          exports: 'named',
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
            'react-dom/client': 'ReactDOM'
          }
        }
      }
    } : {
      outDir: 'dist',
      emptyOutDir: false,
      chunkSizeWarningLimit: 2500
    },
    server: {
      port: 3054,
      strictPort: false,
      proxy: {
        '/binance-api': {
          target: 'https://api.binance.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/binance-api/, ''),
          secure: true,
        }
      }
    }
  };
});
