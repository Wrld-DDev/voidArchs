import path from 'path';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { diffLines } from 'diff';
import Table from 'cli-table3';
import readline from 'readline';
import ora from 'ora';

// Get the project name
const getProjectName = () => path.basename(process.cwd());

// Get the database path
const getDatabasePath = () => path.join(process.cwd(), `${getProjectName()}.db`);

// Block and unblock input to prevent interference
const blockInput = () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.pause(); // Pause the input
    return rl;
};

const unblockInput = (rl) => {
    rl.close(); // Resume input by closing readline
};

// Filter files by extension or directory
const filterFiles = (files, filter) => {
    if (!filter) return files;

    const { fileType, directory } = filter;
    return files.filter((file) => {
        const matchesType = fileType ? file.path.endsWith(fileType) : true;
        const matchesDir = directory ? file.path.startsWith(directory) : true;
        return matchesType && matchesDir;
    });
};

// Display side-by-side diff using cli-table3
const displaySideBySideDiff = (filePath, content1, content2) => {
    const diffs = diffLines(content1, content2);

    const table = new Table({
        head: [chalk.blue('Old Version'), chalk.green('New Version')],
        colWidths: [50, 50],
    });

    diffs.forEach((part) => {
        const left = part.removed ? chalk.red(part.value.trim()) : part.added ? '' : chalk.gray(part.value.trim());
        const right = part.added ? chalk.green(part.value.trim()) : part.removed ? '' : chalk.gray(part.value.trim());
        table.push([left, right]);
    });

    console.log(chalk.yellow(`\nFile: ${filePath}`));
    console.log(table.toString());
};

// Compare two snapshots
const diffSnapshots = async () => {
    console.clear(); // Clear the console for a clean interface
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        console.error(chalk.red(`Project not initialized. Run "svc init" first.`));
        return;
    }

    const rl = blockInput(); // Block input during snapshot diff

    try {
        const db = new sqlite3.Database(dbPath);

        const project = await new Promise((resolve, reject) =>
            db.get(`SELECT id FROM projects WHERE name = ?`, [getProjectName()], (err, result) => {
                if (err) return reject(err);
                resolve(result);
            })
        );

        if (!project) {
            console.error(chalk.red(`Error finding project "${getProjectName()}". Ensure it is initialized.`));
            return;
        }

        const snapshots = await new Promise((resolve, reject) =>
            db.all(
                `SELECT id, description, created_at FROM snapshots WHERE project_id = ? ORDER BY created_at ASC`,
                [project.id],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            )
        );

        if (snapshots.length < 2) {
            console.log(chalk.yellow('Not enough snapshots to compare.'));
            return;
        }

        const { snapshotIds } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'snapshotIds',
                message: 'Select two snapshots to compare:',
                choices: snapshots.map((snap) => ({
                    name: `${snap.id}: ${snap.description} (${snap.created_at})`,
                    value: snap.id,
                })),
                validate: (input) => input.length === 2 || 'Please select exactly two snapshots.',
            },
        ]);

        const [snapshot1, snapshot2] = snapshotIds;

        const filterOptions = await inquirer.prompt([
            {
                type: 'input',
                name: 'fileType',
                message: 'Filter by file type (e.g., .js, .css). Leave blank for no filter:',
                default: '',
            },
            {
                type: 'input',
                name: 'directory',
                message: 'Filter by directory (e.g., src/). Leave blank for no filter:',
                default: '',
            },
        ]);

        console.log('\n'); // Add spacing before starting the spinner
        const spinner = ora('Processing snapshot comparison...').start();

        const files = await new Promise((resolve, reject) =>
            db.all(
                `SELECT sf.snapshot_id, f.path, sf.content
                 FROM snapshot_files sf
                 INNER JOIN files f ON sf.file_id = f.id
                 WHERE sf.snapshot_id IN (?, ?)`,
                [snapshot1, snapshot2],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            )
        );

        const filesBySnapshot = files.reduce((acc, file) => {
            if (!acc[file.snapshot_id]) acc[file.snapshot_id] = {};
            acc[file.snapshot_id][file.path] = file.content || '';
            return acc;
        }, {});

        const files1 = filesBySnapshot[snapshot1] || {};
        const files2 = filesBySnapshot[snapshot2] || {};

        const filteredFiles = filterFiles(
            Object.keys({ ...files1, ...files2 }).map((path) => ({
                path,
                content1: files1[path] || '',
                content2: files2[path] || '',
            })),
            filterOptions
        );

        spinner.stop(); // Stop the spinner before displaying results

        if (filteredFiles.length === 0) {
            console.log(chalk.yellow('No matching files found based on the filter criteria.'));
        } else {
            console.log(chalk.bold.green(`\nDiff Between Snapshots ${snapshot1} and ${snapshot2}:`));
            filteredFiles.forEach(({ path, content1, content2 }) =>
                displaySideBySideDiff(path, content1, content2)
            );
        }

        db.close();
    } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
    } finally {
        unblockInput(rl); // Unblock input even in case of an error
    }
};

export default diffSnapshots;
