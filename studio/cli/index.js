#!/usr/bin/env node

import { execSync } from 'node:child_process';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');

const runMigrations = () => {
    console.log('Running SQLite migrations...');
    const migratePath = path.join(packageRoot, 'migrate.js');
    execSync(`node ${migratePath}`, { stdio: 'inherit' });
};

const startApp = () => {
    console.log('Starting Enochian studio at http://localhost:56765');
    const serverPath = path.join(packageRoot, '.output', 'server', 'index.mjs');
    execSync(`PORT=56765 node ${serverPath}`, { stdio: 'inherit' });
};

const main = () => {
    const [, , command] = process.argv;

    if (command === 'studio') {
        runMigrations();
        startApp();
    } else {
        console.log('Unknown command. Use "studio" to start the app.');
    }
};

main();
