#!/usr/bin/env node
// Launcher: starts Vite dev server programmatically (no shell needed)
process.chdir(__dirname);
import('./node_modules/vite/dist/node/index.js').then(({ createServer }) => {
    createServer({ server: { port: 5173, host: true } }).then(server => server.listen());
}).catch(() => {
    // Fallback: load vite.js directly
    require('./node_modules/vite/bin/vite.js');
});
