import path from 'path';
import sqlite3 from 'sqlite3';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';

// Get the project name
const getProjectName = () => path.basename(process.cwd());

// Get the database path
const getDatabasePath = () => path.join(process.cwd(), `${getProjectName()}.db`);

// Delete a snapshot
const deleteSnapshot = async () => {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        console.error(chalk.red(`Project not initialized. Run "svc init" first.`));
        return;
    }

    const db = new sqlite3.Database(dbPath);
    db.get(`SELECT id FROM projects WHERE name = ?`, [getProjectName()], async (err, project) => {
        if (err || !project) {
            console.error(chalk.red(`Error finding project "${getProjectName()}". Ensure it is initialized.`));
            db.close();
            return;
        }

        db.all(
            `SELECT id, description, created_at FROM snapshots WHERE project_id = ? ORDER BY created_at ASC`,
            [project.id],
            async (err, snapshots) => {
                if (err || snapshots.length === 0) {
                    console.log(chalk.yellow('No snapshots found for this project.'));
                    db.close();
                    return;
                }

                const { snapshotId } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'snapshotId',
                        message: 'Select a snapshot to delete:',
                        choices: snapshots.map((snap) => ({
                            name: `${snap.id}: ${snap.description} (${snap.created_at})`,
                            value: snap.id,
                        })),
                    },
                ]);

                // Confirm before deletion
                const { confirm } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: `Are you sure you want to delete snapshot ID ${snapshotId}?`,
                        default: false,
                    },
                ]);

                if (!confirm) {
                    console.log(chalk.yellow('Snapshot deletion canceled.'));
                    db.close();
                    return;
                }

                // Delete snapshot and associated files
                db.run(
                    `DELETE FROM snapshot_files WHERE snapshot_id = ?`,
                    [snapshotId],
                    (err) => {
                        if (err) {
                            console.error(chalk.red('Error deleting snapshot files:'), err.message);
                            db.close();
                            return;
                        }

                        db.run(
                            `DELETE FROM snapshots WHERE id = ?`,
                            [snapshotId],
                            (err) => {
                                if (err) {
                                    console.error(chalk.red('Error deleting snapshot:'), err.message);
                                } else {
                                    console.log(chalk.green(`Snapshot with ID ${snapshotId} deleted successfully.`));
                                }
                                db.close();
                            }
                        );
                    }
                );
            }
        );
    });
};

export default deleteSnapshot;
