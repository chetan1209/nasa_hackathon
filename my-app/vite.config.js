// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium'; // Import the plugin

export default defineConfig({
  plugins: [react(), cesium()], // Add the cesium plugin
});