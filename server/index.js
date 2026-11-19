import { loadConfig } from './config.js';
import { createApp } from './app.js';

try {
  const config = loadConfig();
  const server = createApp(config).listen(config.PORT, config.HOST, () => {
    console.log(`MinaFlow API listening at http://${config.HOST}:${config.PORT}`);
  });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'The selected port is already in use.' : 'The server could not start.');
    process.exitCode = 1;
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
