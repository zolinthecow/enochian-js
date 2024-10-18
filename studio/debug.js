import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';

// Function to log with timestamp
function logWithTime(message) {
    const now = new Date();
    console.log(`[${now.toISOString()}] ${message}`);
}

// Function to measure execution time
function measureTime(fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    return { result, duration: end - start };
}

// Main debugging function
async function debugDatabaseQuery() {
    logWithTime('Starting database query debug');

    let db;
    try {
        // Open database connection
        logWithTime('Opening database connection');
        db = new Database('enochian-studio.sqlite', { verbose: console.log });

        // Log database configuration
        logWithTime('Database configuration:');
        console.log(
            'Journal mode:',
            db.pragma('journal_mode', { simple: true }),
        );
        console.log('Synchronous:', db.pragma('synchronous', { simple: true }));
        console.log(
            'Busy timeout:',
            db.pragma('busy_timeout', { simple: true }),
        );

        // Prepare and execute query
        logWithTime('Preparing query');
        const stmt = db.prepare('SELECT * FROM PromptType');

        logWithTime('Executing query');
        const { result: promptTypes, duration } = measureTime(() => stmt.all());

        logWithTime(`Query executed in ${duration.toFixed(2)}ms`);
        logWithTime(`Retrieved ${promptTypes.length} prompt types`);

        // Log the first few results
        logWithTime('First few results:');
        console.log(promptTypes.slice(0, 5));
    } catch (error) {
        logWithTime('Error occurred:');
        console.error(error);
    } finally {
        if (db) {
            logWithTime('Closing database connection');
            db.close();
        }
        logWithTime('Debug process completed');
    }
}

// Run the debug function
debugDatabaseQuery();
