import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { calculateFileHash } from '../../utils/hash.js';
import { loadIgnoreRules } from '../../utils/ignore.js';
import initDatabase from '../../database/init.js';

// Get the project name
const getProjectName = () => path.basename(process.cwd());

// Get the database path
const getDatabasePath = () => path.join(process.cwd(), `${getProjectName()}.db`);

// Retrieve the current project ID
const getProjectId = async () => {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        console.log(chalk.red('Project not initialized. Run "svc init" first.'));
        return null;
    }

    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.get(`SELECT id FROM projects WHERE name = ?`, [getProjectName()], (err, project) => {
            if (err) {
                db.close();
                reject(err);
            } else {
                db.close();
                resolve(project ? project.id : null);
            }
        });
    });
};

// Initialize the project
const initProject = () => {
    console.clear();
    const spinner = ora('Initializing project...').start();
    const dbPath = getDatabasePath();
    const ignoreFilePath = path.join(process.cwd(), '.svcignore');

    if (fs.existsSync(dbPath)) {
        spinner.succeed(`Project "${getProjectName()}" is already initialized.`);
        return;
    }

    initDatabase(dbPath, () => {
        const db = new sqlite3.Database(dbPath);
        db.run(`INSERT INTO projects (name) VALUES (?)`, [getProjectName()], (err) => {
            if (err) {
                spinner.fail(`Error inserting project name: ${err.message}`);
            } else {
                spinner.succeed(`Project "${getProjectName()}" initialized successfully.`);
            }
        });
        db.close();
    });

    if (!fs.existsSync(ignoreFilePath)) {
        fs.writeFileSync(ignoreFilePath, ['node_modules/', '.git/', '*.log', '*.tmp', '*.db'].join('\n'));
        console.log(chalk.green(`.svcignore file created with default ignore patterns.`));
    }
};

// Track files
const trackFiles = () => {
    console.clear();
    const spinner = ora('Tracking files...').start();
    const dbPath = getDatabasePath();

    if (!fs.existsSync(dbPath)) {
        spinner.fail('Project not initialized. Run "svc init" first.');
        return;
    }

    const db = new sqlite3.Database(dbPath);
    const projectDir = process.cwd();
    const ignorePatterns = loadIgnoreRules();

    const traverseDirectory = (dir, projectId) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        entries.forEach((entry) => {
            const entryPath = path.relative(projectDir, path.join(dir, entry.name));
            if (ignorePatterns.some((pattern) => new RegExp(`^${pattern.replace(/\*/g, '.*')}$`).test(entryPath))) {
                console.log(chalk.gray(`Ignored: ${entryPath}`));
                return;
            }

            if (entry.isFile()) {
                const hash = calculateFileHash(path.join(projectDir, entryPath));
                db.get(`SELECT * FROM files WHERE path = ?`, [entryPath], (err, row) => {
                    if (row) {
                        db.run(`UPDATE files SET hash = ?, modified_at = CURRENT_TIMESTAMP WHERE path = ?`, [hash, entryPath]);
                    } else {
                        db.run(
                            `INSERT INTO files (path, hash, project_id, modified_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                            [entryPath, hash, projectId]
                        );
                    }
                });
            } else if (entry.isDirectory()) {
                traverseDirectory(path.join(dir, entry.name), projectId);
            }
        });
    };

    db.get(`SELECT id FROM projects WHERE name = ?`, [getProjectName()], (err, project) => {
        if (err) {
            spinner.fail(`Error retrieving project: ${err.message}`);
        } else if (project) {
            traverseDirectory(projectDir, project.id);
            spinner.succeed('File tracking completed.');
        } else {
            spinner.fail('No project found for tracking.');
        }
        db.close();
    });
};

// Create a snapshot
const createSnapshot = async () => {
    console.clear();
    const spinner = ora('Creating snapshot...').start();
    const dbPath = getDatabasePath();

    if (!fs.existsSync(dbPath)) {
        spinner.fail('Project not initialized. Run "svc init" first.');
        return;
    }

    await trackFiles(); // Ensure files are up-to-date before taking a snapshot

    const db = new sqlite3.Database(dbPath);
    db.get(`SELECT id FROM projects WHERE name = ?`, [getProjectName()], async (err, project) => {
        if (err) {
            spinner.fail(`Error retrieving project: ${err.message}`);
            return;
        }

        if (!project) {
            spinner.fail('No project found for snapshot creation.');
            return;
        }

        spinner.stop(); // Stop spinner before showing prompt
        const { description } = await inquirer.prompt([
            { type: 'input', name: 'description', message: 'Enter snapshot description:' },
        ]);
        spinner.start('Finalizing snapshot creation...');

        db.run(
            `INSERT INTO snapshots (project_id, description) VALUES (?, ?)`,
            [project.id, description],
            function (err) {
                if (err) {
                    spinner.fail(`Error creating snapshot: ${err.message}`);
                    return;
                }

                const snapshotId = this.lastID;
                db.all(`SELECT id, path FROM files WHERE project_id = ?`, [project.id], (err, files) => {
                    if (err) {
                        spinner.fail(`Error retrieving files: ${err.message}`);
                        return;
                    }

                    files.forEach((file) => {
                        const filePath = path.join(process.cwd(), file.path);
                        const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
                        db.run(
                            `INSERT INTO snapshot_files (snapshot_id, file_id, content) VALUES (?, ?, ?)`,
                            [snapshotId, file.id, content]
                        );
                    });
                });
                spinner.succeed(`Snapshot ${snapshotId} created successfully.`);
            }
        );
        db.close();
    });
};

// Delete a snapshot
const deleteSnapshot = async () => {
    console.clear();
    const spinner = ora('Deleting snapshot...').start();
    const dbPath = getDatabasePath();

    if (!fs.existsSync(dbPath)) {
        spinner.fail('Project not initialized. Run "svc init" first.');
        return;
    }

    const db = new sqlite3.Database(dbPath);
    db.get(`SELECT id FROM projects WHERE name = ?`, [getProjectName()], async (err, project) => {
        if (err) {
            spinner.fail(`Error retrieving project: ${err.message}`);
            db.close();
            return;
        }

        if (!project) {
            spinner.fail('No project found for snapshot deletion.');
            db.close();
            return;
        }

        db.all(
            `SELECT id, description FROM snapshots WHERE project_id = ?`,
            [project.id],
            async (err, snapshots) => {
                if (err) {
                    spinner.fail(`Error retrieving snapshots: ${err.message}`);
                    db.close();
                    return;
                }

                if (snapshots.length === 0) {
                    spinner.fail('No snapshots available to delete.');
                    db.close();
                    return;
                }

                spinner.stop(); // Stop spinner before showing prompt
                const { snapshotId } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'snapshotId',
                        message: 'Select snapshot to delete:',
                        choices: snapshots.map((snap) => ({
                            name: `${snap.id}: ${snap.description}`,
                            value: snap.id,
                        })),
                    },
                ]);
                spinner.start('Finalizing snapshot deletion...');

                db.run(`DELETE FROM snapshot_files WHERE snapshot_id = ?`, [snapshotId], (err) => {
                    if (err) {
                        spinner.fail(`Error deleting snapshot files: ${err.message}`);
                        db.close();
                        return;
                    }

                    db.run(`DELETE FROM snapshots WHERE id = ?`, [snapshotId], (err) => {
                        if (err) {
                            spinner.fail(`Error deleting snapshot: ${err.message}`);
                        } else {
                            spinner.succeed(`Snapshot ${snapshotId} deleted successfully.`);
                        }
                        db.close();
                    });
                });
            }
        );
    });
};

// Export functions
export { initProject, trackFiles, createSnapshot, deleteSnapshot, getDatabasePath, getProjectId };
