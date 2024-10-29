#!/usr/bin/env node
import { execSync } from 'node:child_process';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');

const runMigrations = () => {
    console.log('Running SQLite migrations...');
    const migratePath = path.join(packageRoot, 'migrate.js');
    execSync(`node ${migratePath}`, { stdio: 'inherit' });
};

const startApp = (port) => {
    console.log(`Starting Enochian studio at http://localhost:${port}`);
    const serverPath = path.join(packageRoot, '.output', 'server', 'index.mjs');
    execSync(`PORT=${port} node ${serverPath}`, { stdio: 'inherit' });
};

const main = () => {
    const args = process.argv.slice(2);
    const portIndex = args.indexOf('--PORT');
    const port = portIndex !== -1 ? args[portIndex + 1] : 56765;

    if (args[0] === 'studio') {
        runMigrations();
        startApp(port);
    } else {
        console.log('Unknown command. Use "studio" to start the app.');
        console.log('Options:');
        console.log('  --PORT <number>    Set custom port (default: 56765)');
    }
};

main();
