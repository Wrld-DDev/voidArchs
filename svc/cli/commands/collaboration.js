import crypto from 'crypto';
import sqlite3 from 'sqlite3';
import chalk from 'chalk';
import { getDatabasePath } from './snapshot.js';

// Generate a random secret key
const generateSecretKey = () => {
    return crypto.randomBytes(16).toString('hex');
};

// Ensure the `secret_key` column exists in the `projects` table
const ensureSecretKeyColumn = async () => {
    const dbPath = getDatabasePath();
    const db = new sqlite3.Database(dbPath);

    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(projects)`, (err, columns) => {
            if (err) {
                db.close();
                return reject(err);
            }

            const columnExists = columns.some((column) => column.name === 'secret_key');
            if (!columnExists) {
                db.run(`ALTER TABLE projects ADD COLUMN secret_key TEXT`, (alterErr) => {
                    if (alterErr) {
                        db.close();
                        return reject(alterErr);
                    }
                    console.log(chalk.green('Added "secret_key" column to "projects" table.'));
                    db.close();
                    resolve(true);
                });
            } else {
                db.close();
                resolve(false);
            }
        });
    });
};

// Retrieve or generate a secret key for the current project
const getSecretKey = async (projectId) => {
    await ensureSecretKeyColumn();

    const dbPath = getDatabasePath();
    const db = new sqlite3.Database(dbPath);

    return new Promise((resolve, reject) => {
        db.get(`SELECT secret_key FROM projects WHERE id = ?`, [projectId], (err, row) => {
            if (err) {
                db.close();
                return reject(err);
            }

            if (row && row.secret_key) {
                db.close();
                resolve(row.secret_key);
            } else {
                const newKey = generateSecretKey();
                db.run(
                    `UPDATE projects SET secret_key = ? WHERE id = ?`,
                    [newKey, projectId],
                    (updateErr) => {
                        db.close();
                        if (updateErr) return reject(updateErr);
                        resolve(newKey);
                    }
                );
            }
        });
    });
};

// Regenerate a new secret key for the current project
const regenerateSecretKey = async (projectId) => {
    await ensureSecretKeyColumn();

    const dbPath = getDatabasePath();
    const db = new sqlite3.Database(dbPath);
    const newKey = generateSecretKey();

    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE projects SET secret_key = ? WHERE id = ?`,
            [newKey, projectId],
            (err) => {
                db.close();
                if (err) return reject(err);
                resolve(newKey);
            }
        );
    });
};

export { generateSecretKey, getSecretKey, regenerateSecretKey };
