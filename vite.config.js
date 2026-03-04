import { resolve } from 'path';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  root: '.',
  publicDir: 'public',
  plugins: [
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'events', 'util', 'process', 'http', 'https', 'os', 'url', 'assert', 'path', 'vm', 'string_decoder'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        mixer: resolve(__dirname, 'mixer.html'),
      },
      output: {
        manualChunks: {
          vendor: ['ethers', 'viem', '@privy-io/js-sdk-core'],
          clob: ['@polymarket/clob-client'],
          umbra: ['@umbra-privacy/sdk', '@umbra-privacy/web-zk-prover'],
          solana: ['@solana/web3.js'],
        },
      },
    },
  },
});
