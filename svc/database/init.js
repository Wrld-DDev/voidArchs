import sqlite3 from 'sqlite3';
import chalk from 'chalk';

const initDatabase = (dbPath, callback) => {
    const db = new sqlite3.Database(dbPath);

    db.serialize(() => {
        console.log(chalk.cyan('Initializing database and ensuring tables are up to date...'));

        // Create `projects` table if it doesn't exist
        db.run(`
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if `secret_key` column exists in `projects` table
        db.all(`PRAGMA table_info(projects)`, (err, columns) => {
            if (err) {
                console.error(chalk.red('Error retrieving table schema:'), err.message);
                return;
            }

            const columnExists = columns.some((column) => column.name === 'secret_key');
            console.log(chalk.yellow(`Does "secret_key" column exist? ${columnExists}`));

            if (!columnExists) {
                console.log(chalk.blue('Adding "secret_key" column to "projects" table...'));
                db.run(
                    `ALTER TABLE projects ADD COLUMN secret_key TEXT`,
                    (alterErr) => {
                        if (alterErr) {
                            console.error(chalk.red('Error adding "secret_key" column:'), alterErr.message);
                        } else {
                            console.log(chalk.green('"secret_key" column successfully added.'));
                        }
                    }
                );
            } else {
                console.log(chalk.green('"secret_key" column already exists.'));
            }
        });

        // Create `files` table
        db.run(`
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                path TEXT NOT NULL UNIQUE,
                hash TEXT,
                content TEXT,
                modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        `);

        // Create `snapshots` table
        db.run(`
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        `);

        // Create `snapshot_files` table
        db.run(`
            CREATE TABLE IF NOT EXISTS snapshot_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id INTEGER,
                file_id INTEGER,
                content TEXT,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots(id),
                FOREIGN KEY (file_id) REFERENCES files(id)
            )
        `, (err) => {
            if (err) {
                console.error(chalk.red('Error creating tables:'), err.message);
            } else {
                console.log(chalk.green('Database tables created successfully.'));
                if (callback) callback();
            }
        });
    });

    db.close((err) => {
        if (err) console.error(chalk.red('Error closing the database:'), err.message);
        else console.log(chalk.green('Database handle closed successfully.'));
    });
};

export default initDatabase;
