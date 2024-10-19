#!/usr/bin/env node

import { execSync } from 'node:child_process';
import path from 'node:path';

const packageRoot = path.resolve(__dirname, '..');

const runMigrations = () => {
    console.log('Running SQLite migrations...');
    const migratePath = path.jjoin(packageRoot, 'migrate.js');
    execSync(`node ${migratePath}`, { stdio: 'inherit' });
};

const startApp = () => {
    console.log('Starting Enochian studio at http://localhost:56765');
    const serverPath = path.join(packageRoot, '.output', 'server', 'index.mjs');
    execSync(`node ${serverPath}`, { stdio: 'inherit' });
};

const main = () => {
    const [, , command] = process.argv;

    if (command === 'run') {
        runMigrations();
        startApp();
    } else {
        console.log('Unknown command. Use "run" to start the app.');
    }
};

main();
