import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const db = new Database('enochian-studio.sqlite');

const packageRoot = path.resolve(import.meta.dirname);

function applyMigrations() {
    // Ensure migrations table exists
    db.exec(`
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
    const appliedMigrations = db
        .prepare('SELECT name FROM migrations')
        .all()
        .map((row) => row.name);

    // Apply new migrations
    for (const file of migrationFiles) {
        if (!appliedMigrations.includes(file)) {
            console.log(`Applying migration: ${file}`);
            const migration = fs.readFileSync(
                path.join(migrationsDir, file),
                'utf8',
            );

            db.transaction(() => {
                db.exec(migration);
                db.prepare('INSERT INTO migrations (name) VALUES (?)').run(
                    file,
                );
            })();

            console.log(`Migration applied: ${file}`);
        }
    }

    console.log('All migrations applied successfully');
}

applyMigrations();
