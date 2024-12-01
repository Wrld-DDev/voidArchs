import path from 'path';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

// Get the project name
const getProjectName = () => path.basename(process.cwd());

// Get the database path
const getDatabasePath = () => path.join(process.cwd(), `${getProjectName()}.db`);

// Helper function for file restoration
const restoreFile = (filePath, content) => {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content || '', 'utf-8');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

// Revert all files to a specific snapshot
const revertToSnapshot = async () => {
    const spinner = ora('Loading snapshots...').start();
    const dbPath = getDatabasePath();

    if (!fs.existsSync(dbPath)) {
        spinner.fail('Project not initialized. Run "svc init" first.');
        return;
    }

    const db = new sqlite3.Database(dbPath);

    db.get(`SELECT id FROM projects WHERE name = ?`, [getProjectName()], async (err, project) => {
        if (err || !project) {
            spinner.fail(`Error finding project "${getProjectName()}".`);
            db.close();
            return;
        }

        db.all(
            `SELECT id, description, created_at FROM snapshots WHERE project_id = ? ORDER BY created_at ASC`,
            [project.id],
            async (err, snapshots) => {
                if (err || snapshots.length === 0) {
                    spinner.fail('No snapshots found for this project.');
                    db.close();
                    return;
                }

                spinner.stop();

                const { snapshotId } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'snapshotId',
                        message: 'Select a snapshot to revert to:',
                        choices: snapshots.map((snap) => ({
                            name: `${snap.id}: ${snap.description} (${snap.created_at})`,
                            value: snap.id,
                        })),
                    },
                ]);

                spinner.start('Reverting all files...');
                db.all(
                    `SELECT f.path, sf.content
                     FROM snapshot_files sf
                     INNER JOIN files f ON sf.file_id = f.id
                     WHERE sf.snapshot_id = ?`,
                    [snapshotId],
                    (err, files) => {
                        if (err || files.length === 0) {
                            spinner.fail('No files found in the selected snapshot.');
                            db.close();
                            return;
                        }

                        files.forEach((file) => {
                            const filePath = path.join(process.cwd(), file.path);
                            const result = restoreFile(filePath, file.content);
                            if (result.success) {
                                console.log(chalk.green(`Restored: ${file.path}`));
                            } else {
                                console.log(chalk.red(`Failed to restore ${file.path}: ${result.error}`));
                            }
                        });

                        spinner.succeed(`Reverted to snapshot ID: ${snapshotId}`);
                        db.close();
                    }
                );
            }
        );
    });
};

// Selectively restore files from a snapshot
const selectiveRestore = async () => {
    const spinner = ora('Loading snapshots...').start();
    const dbPath = getDatabasePath();

    if (!fs.existsSync(dbPath)) {
        spinner.fail('Project not initialized. Run "svc init" first.');
        return;
    }

    const db = new sqlite3.Database(dbPath);

    db.get(`SELECT id FROM projects WHERE name = ?`, [getProjectName()], async (err, project) => {
        if (err || !project) {
            spinner.fail(`Error finding project "${getProjectName()}".`);
            db.close();
            return;
        }

        db.all(
            `SELECT id, description, created_at FROM snapshots WHERE project_id = ? ORDER BY created_at ASC`,
            [project.id],
            async (err, snapshots) => {
                if (err || snapshots.length === 0) {
                    spinner.fail('No snapshots found for this project.');
                    db.close();
                    return;
                }

                spinner.stop();

                const { snapshotId } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'snapshotId',
                        message: 'Select a snapshot to restore from:',
                        choices: snapshots.map((snap) => ({
                            name: `${snap.id}: ${snap.description} (${snap.created_at})`,
                            value: snap.id,
                        })),
                    },
                ]);

                db.all(
                    `SELECT f.path, sf.content 
                     FROM snapshot_files sf
                     INNER JOIN files f ON sf.file_id = f.id
                     WHERE sf.snapshot_id = ?`,
                    [snapshotId],
                    async (err, files) => {
                        if (err || files.length === 0) {
                            console.log(chalk.yellow('No files found in the selected snapshot.'));
                            db.close();
                            return;
                        }

                        const { selectedFiles } = await inquirer.prompt([
                            {
                                type: 'checkbox',
                                name: 'selectedFiles',
                                message: 'Select files to restore:',
                                choices: files.map((file) => ({
                                    name: file.path,
                                    value: file,
                                })),
                                validate: (input) =>
                                    input.length > 0
                                        ? true
                                        : 'You must select at least one file to proceed.',
                            },
                        ]);

                        // Ensure no restoration happens if no files are explicitly selected
                        if (!selectedFiles || selectedFiles.length === 0) {
                            console.log(chalk.yellow('No files selected for restoration.'));
                            db.close();
                            return;
                        }

                        const restoreSpinner = ora('Restoring selected files...').start();

                        selectedFiles.forEach((file) => {
                            const filePath = path.join(process.cwd(), file.path);
                            const result = restoreFile(filePath, file.content);

                            if (result.success) {
                                console.log(chalk.green(`Restored: ${file.path}`));
                            } else {
                                console.log(chalk.red(`Failed to restore ${file.path}: ${result.error}`));
                            }
                        });

                        restoreSpinner.succeed('Selective file restoration completed.');
                        db.close();
                    }
                );
            }
        );
    });
};




export { revertToSnapshot, selectiveRestore };
