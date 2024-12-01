import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import chokidar from 'chokidar';
import debounce from 'lodash.debounce';

// Maintain categorized changes
const monitoredChanges = { added: [], modified: [], deleted: [] };

// Helper: Format timestamped logs
const logWithTimestamp = (message, color = chalk.white) => {
    const timestamp = new Date().toISOString();
    console.log(color(`[${timestamp}] ${message}`));
};

// Helper: Process file change events
const processFileChange = (eventType, filePath, baseDir) => {
    const relativePath = path.relative(baseDir, filePath);
    switch (eventType) {
        case 'add':
            if (!monitoredChanges.added.includes(relativePath)) monitoredChanges.added.push(relativePath);
            break;
        case 'change':
            if (!monitoredChanges.modified.includes(relativePath)) monitoredChanges.modified.push(relativePath);
            break;
        case 'unlink':
            if (!monitoredChanges.deleted.includes(relativePath)) monitoredChanges.deleted.push(relativePath);
            break;
        default:
            break;
    }
};

// Helper: Categorize and display changes
const categorizeChanges = () => {
    console.log(chalk.cyan('\nSummary of Detected Changes:\n'));
    ['added', 'modified', 'deleted'].forEach((type) => {
        if (monitoredChanges[type].length > 0) {
            console.log(chalk.bold(`${type.toUpperCase()}:`));
            monitoredChanges[type].forEach((file) => console.log(chalk.green(`  - ${file}`)));
        }
    });
};

// Handle Interactive Prompts for Changes
const handleInteractivePrompts = async (baseDir) => {
    for (const type of ['added', 'modified', 'deleted']) {
        for (const file of monitoredChanges[type]) {
            const { action } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: `Detected "${type}" for ${file}. What would you like to do?`,
                    choices: [
                        { name: 'Track File', value: 'track' },
                        { name: 'Ignore Permanently', value: 'ignore' },
                        { name: 'Skip', value: 'skip' },
                    ],
                },
            ]);

            switch (action) {
                case 'track':
                    logWithTimestamp(`Tracking ${file}...`, chalk.green);
                    // Add your logic to track the file (e.g., database update).
                    break;
                case 'ignore':
                    logWithTimestamp(`Ignoring ${file}...`, chalk.red);
                    const ignoreFilePath = path.join(baseDir, '.svcignore');
                    fs.appendFileSync(ignoreFilePath, `${file}\n`);
                    logWithTimestamp(`Added ${file} to .svcignore`, chalk.green);
                    break;
                case 'skip':
                    logWithTimestamp(`Skipping ${file}.`, chalk.yellow);
                    break;
                default:
                    console.log(chalk.red('Invalid action selected.'));
            }
        }
    }

    // Clear monitored changes after handling them
    monitoredChanges.added = [];
    monitoredChanges.modified = [];
    monitoredChanges.deleted = [];
};

// Real-Time Monitoring Function
const monitorFiles = () => {
    return new Promise((resolve, reject) => {
        const baseDir = process.cwd();
        const spinner = ora('Starting real-time file monitoring...').start();

        const watcher = chokidar.watch(baseDir, {
            ignored: /node_modules|\.git/,
            persistent: true,
            ignoreInitial: true,
        });

        watcher
            .on('add', (filePath) => {
                logWithTimestamp(`File added: ${filePath}`, chalk.green);
                processFileChange('add', filePath, baseDir);
            })
            .on('change', debounce((filePath) => {
                logWithTimestamp(`File modified: ${filePath}`, chalk.blue);
                processFileChange('change', filePath, baseDir);
            }, 300))
            .on('unlink', (filePath) => {
                logWithTimestamp(`File deleted: ${filePath}`, chalk.red);
                processFileChange('unlink', filePath, baseDir);
            })
            .on('error', (error) => {
                logWithTimestamp(`Watcher error: ${error.message}`, chalk.red);
                spinner.fail('Monitoring encountered an error.');
                watcher.close();
                reject(error);
            });

        // Graceful shutdown on SIGINT
        process.on('SIGINT', async () => {
            spinner.stop();
            console.log(chalk.blue('\nStopping file monitoring...'));

            // Show detected changes
            categorizeChanges();

            // Handle prompts for changes
            await handleInteractivePrompts(baseDir);

            watcher.close();
            resolve();
        });

        spinner.succeed('Monitoring started. Press Ctrl+C to stop.');
    });
};

export default monitorFiles;
