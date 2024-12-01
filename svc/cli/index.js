#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import readline from 'readline';
import {
    initProject,
    trackFiles,
    createSnapshot,
    deleteSnapshot,
    getDatabasePath,
    getProjectId,
} from './commands/snapshot.js';
import { revertToSnapshot, selectiveRestore } from './commands/revert.js';
import diffSnapshots from './commands/diff.js';
import { showHistory, listSnapshots } from './commands/history.js';
import { editIgnoreRules, previewIgnoredFiles } from '../utils/ignore.js';
import monitorFiles from './commands/monitor.js';
import { getSecretKey, regenerateSecretKey } from './commands/collaboration.js';
import fs from 'fs';

// Helper: Pause for user input
const pause = async () => {
    console.log(chalk.dim('\nPress Enter to return to the menu...'));
    await inquirer.prompt([{ type: 'input', name: 'pause', message: '' }]);
};

// Helper: Handle exit signals gracefully
const handleExit = (message = 'Exiting application...') => {
    console.log(chalk.yellow(`\n${message}`));
    process.exit(0);
};

// Block input to prevent interference
const blockInput = () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.pause();
    return rl;
};

// Unblock input after processing
const unblockInput = (rl) => {
    rl.close();
};

// Main menu
const mainMenu = async () => {
    let exit = false;

    while (!exit) {
        console.clear();
        console.log(chalk.bold.cyan('\nSimple Version Control (SVC) CLI\n'));

        const rl = blockInput();
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Select a command:',
                choices: [
                    { name: 'Initialize Project', value: 'init' },
                    { name: 'Track Files', value: 'track' },
                    { name: 'Snapshot Management', value: 'snapshot' },
                    { name: 'Revert Options', value: 'revert' },
                    { name: 'View Diff', value: 'diff' },
                    { name: 'View History', value: 'history' },
                    { name: 'Ignore File Management', value: 'ignore' },
                    { name: 'Monitor Files (Real-Time)', value: 'monitor' },
                    { name: 'Collaboration Features', value: 'collaboration' },
                    { name: 'Exit', value: 'exit' },
                ],
            },
        ]);
        unblockInput(rl);

        switch (action) {
            case 'init':
                await taskHandler('Initialize Project', initProject);
                break;
            case 'track':
                await taskHandler('Track Files', trackFiles);
                break;
            case 'snapshot':
                await snapshotMenu();
                break;
            case 'revert':
                await revertMenu();
                break;
            case 'diff':
                await taskHandler('View Diff', diffSnapshots);
                break;
            case 'history':
                await taskHandler('View Snapshot History', showHistory);
                break;
            case 'ignore':
                await ignoreMenu();
                break;
            case 'monitor':
                await taskHandler('Monitor Files', monitorFiles);
                break;
            case 'collaboration':
                await collaborationMenu();
                break;
            case 'exit':
                handleExit();
                break;
            default:
                console.log(chalk.red('Invalid choice. Please try again.'));
        }
    }
};

// Helper: Task handler
const taskHandler = async (taskName, taskFunction) => {
    console.log(chalk.green(`Starting ${taskName}...`));
    try {
        await taskFunction();
        console.log(chalk.green(`${taskName} completed successfully.`));
        await pause();
    } catch (error) {
        console.error(chalk.red(`${taskName} failed. Error: ${error.message}`));
        await pause();
    }
};

// Ignore File Management Menu
const ignoreMenu = async () => {
    let back = false;

    while (!back) {
        console.clear();
        console.log(chalk.bold.yellow('\nIgnore File Management\n'));

        const rl = blockInput();
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Choose an action:',
                choices: [
                    { name: 'Edit Ignore Rules', value: 'edit' },
                    { name: 'Preview Ignored Files', value: 'preview' },
                    { name: 'Back', value: 'back' },
                ],
            },
        ]);
        unblockInput(rl);

        switch (action) {
            case 'edit':
                await editIgnoreRules();
                await pause();
                break;
            case 'preview':
                await previewIgnoredFiles();
                await pause();
                break;
            case 'back':
                back = true;
                break;
            default:
                console.log(chalk.red('Invalid choice.'));
        }
    }
};

// Snapshot management menu
const snapshotMenu = async () => {
    let back = false;

    while (!back) {
        console.clear();
        console.log(chalk.bold.green('\nSnapshot Management\n'));

        const rl = blockInput();
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Choose an action:',
                choices: [
                    { name: 'Create Snapshot', value: 'create' },
                    { name: 'Delete Snapshot', value: 'delete' },
                    { name: 'View Snapshots', value: 'list' },
                    { name: 'Back', value: 'back' },
                ],
            },
        ]);
        unblockInput(rl);

        switch (action) {
            case 'create':
                await createSnapshot();
                await pause();
                break;
            case 'delete':
                await deleteSnapshot();
                await pause();
                break;
            case 'list':
                await listSnapshots();
                await pause();
                break;
            case 'back':
                back = true;
                break;
            default:
                console.log(chalk.red('Invalid choice.'));
        }
    }
};

// Revert options menu
const revertMenu = async () => {
    let back = false;

    while (!back) {
        console.clear();
        console.log(chalk.bold.blue('\nRevert Options\n'));

        const rl = blockInput();
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Choose an action:',
                choices: [
                    { name: 'Revert to Snapshot', value: 'revert' },
                    { name: 'Selective Revert', value: 'selective' },
                    { name: 'Back', value: 'back' },
                ],
            },
        ]);
        unblockInput(rl);

        switch (action) {
            case 'revert':
                await revertToSnapshot();
                await pause();
                break;
            case 'selective':
                await selectiveRestore();
                await pause();
                break;
            case 'back':
                back = true;
                break;
            default:
                console.log(chalk.red('Invalid choice.'));
        }
    }
};

// Collaboration menu
const collaborationMenu = async () => {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        console.log(chalk.red('No project initialized. Run "Initialize Project" first.'));
        await pause();
        return;
    }

    const projectId = await getProjectId();
    if (!projectId) {
        console.log(chalk.red('No active project found.'));
        await pause();
        return;
    }

    let back = false;

    while (!back) {
        console.clear();
        console.log(chalk.bold.magenta('\nCollaboration Features\n'));

        const rl = blockInput();
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Select a collaboration action:',
                choices: [
                    { name: 'Show Secret Key', value: 'show' },
                    { name: 'Regenerate Secret Key', value: 'regenerate' },
                    { name: 'Back', value: 'back' },
                ],
            },
        ]);
        unblockInput(rl);

        switch (action) {
            case 'show':
                try {
                    const secretKey = await getSecretKey(projectId);
                    console.log(chalk.green(`Secret Key: ${secretKey || 'Not found'}`));
                    await pause();
                } catch (error) {
                    console.error(chalk.red(`Error fetching secret key: ${error.message}`));
                    await pause();
                }
                break;
            case 'regenerate':
                try {
                    const newKey = await regenerateSecretKey(projectId);
                    console.log(chalk.green(`New Secret Key: ${newKey}`));
                    await pause();
                } catch (error) {
                    console.error(chalk.red(`Error regenerating secret key: ${error.message}`));
                    await pause();
                }
                break;
            case 'back':
                back = true;
                break;
            default:
                console.log(chalk.red('Invalid choice.'));
        }
    }
};

// Exit handlers
process.on('SIGINT', () => handleExit('Interrupt signal received. Exiting gracefully.'));
process.on('uncaughtException', (err) => {
    console.error(chalk.red(`Uncaught Exception: ${err.message}`));
    handleExit('Unexpected error occurred. Exiting.');
});

// Start CLI
mainMenu();
