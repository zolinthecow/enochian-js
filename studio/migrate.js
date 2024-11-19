import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

// Get package root directory
const currentFilePath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(currentFilePath));
const dbPath = path.resolve(packageRoot, 'enochian-studio.db');

const client = createClient({
    url: `file:${dbPath}`,
});

export async function applyMigrations() {
    // Ensure migrations table exists
    await client.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Get list of migration files
    const migrationsDir = path.join(packageRoot, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).sort();

    // Get list of applied migrations
    const result = await client.execute('SELECT name FROM migrations');
    const appliedMigrations = result.rows.map((row) => row.name);

    const tx = await client.transaction('write');

    // Apply new migrations
    for (const file of migrationFiles) {
        if (!appliedMigrations.includes(file)) {
            console.log(`Applying migration: ${file}`);
            const migration = fs.readFileSync(
                path.join(migrationsDir, file),
                'utf8',
            );

            await tx.executeMultiple(migration);
            await tx.execute('INSERT INTO migrations (name) VALUES (?)', [
                file,
            ]);

            console.log(`Migration applied: ${file}`);
        }
    }
    await tx.commit();

    console.log('All migrations applied successfully');
}

applyMigrations();
