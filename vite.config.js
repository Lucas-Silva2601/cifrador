import { defineConfig, loadEnv } from 'vite';
import { createOllamaMiddleware } from './api/ollama.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'OLLAMA_');
  const ollamaMiddleware = createOllamaMiddleware(env);

  return {
    base: './',
    plugins: [
      {
        name: 'cifrador-ollama-api',
        configureServer(server) {
          server.middlewares.use(ollamaMiddleware);
        },
        configurePreviewServer(server) {
          server.middlewares.use(ollamaMiddleware);
        },
      },
    ],
    server: {
      port: 3000,
    },
    preview: {
      port: 3000,
    },
  };
});

