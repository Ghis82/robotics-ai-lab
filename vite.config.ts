import { defineConfig } from 'vite';
export default defineConfig({ base: './', preview: { allowedHosts: true, host: '0.0.0.0', port: 4173 }, server: { allowedHosts: true }, test: { environment: 'node' } } as any);
