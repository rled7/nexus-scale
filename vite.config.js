import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // pdfWorker.js uses dynamic import() (pdf.js + its sub-worker), which needs
  // code-splitting — only the ES worker format supports that (default is "iife").
  worker: { format: 'es' },
});
