import path from 'path';
import sqlite3 from 'sqlite3';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';

// Get the project name
const getProjectName = () => path.basename(process.cwd());

// Get the database path
const getDatabasePath = () => path.join(process.cwd(), `${getProjectName()}.db`);

// Show snapshot history
const showHistory = async () => {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        console.error(chalk.red(`Project not initialized. Run "svc init" first.`));
        return;
    }

    const db = new sqlite3.Database(dbPath);
    db.get(`SELECT id FROM projects WHERE name = ?`, [getProjectName()], (err, project) => {
        if (err || !project) {
            console.error(chalk.red(`Error finding project "${getProjectName()}". Ensure it is initialized.`));
            db.close();
            return;
        }

        db.all(
            `SELECT id, description, created_at FROM snapshots WHERE project_id = ? ORDER BY created_at ASC`,
            [project.id],
            (err, snapshots) => {
                if (err || snapshots.length === 0) {
                    console.log(chalk.yellow('No snapshots found.'));
                    db.close();
                    return;
                }

                console.log(chalk.green(`Snapshot History for "${getProjectName()}":`));
                snapshots.forEach((snap) => {
                    console.log(
                        chalk.cyan(`ID: ${snap.id}\nDescription: ${snap.description}\nCreated At: ${snap.created_at}\n`)
                    );
                });

                db.close();
            }
        );
    });
};

// List all snapshots
const listSnapshots = async () => {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        console.error(chalk.red(`Project not initialized. Run "svc init" first.`));
        return;
    }

    const db = new sqlite3.Database(dbPath);
    db.get(`SELECT id FROM projects WHERE name = ?`, [getProjectName()], (err, project) => {
        if (err || !project) {
            console.error(chalk.red(`Error finding project "${getProjectName()}". Ensure it is initialized.`));
            db.close();
            return;
        }

        db.all(
            `SELECT id, description, created_at FROM snapshots WHERE project_id = ? ORDER BY created_at ASC`,
            [project.id],
            (err, snapshots) => {
                if (err || snapshots.length === 0) {
                    console.log(chalk.yellow('No snapshots found.'));
                    db.close();
                    return;
                }

                console.log(chalk.green('Available Snapshots:'));
                snapshots.forEach((snap) => {
                    console.log(`ID: ${snap.id} | Description: ${snap.description} | Created At: ${snap.created_at}`);
                });

                db.close();
            }
        );
    });
};

// Export both functions
export { showHistory, listSnapshots };
