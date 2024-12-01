import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import glob from 'glob';

// Get the `.svcignore` file path
const getIgnoreFilePath = () => path.join(process.cwd(), '.svcignore');

// Load existing rules from `.svcignore`
const loadIgnoreRules = () => {
    const ignoreFilePath = getIgnoreFilePath();
    if (!fs.existsSync(ignoreFilePath)) return [];
    return fs
        .readFileSync(ignoreFilePath, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && !line.startsWith('//')); // Skip comments
};

// Save updated rules back to `.svcignore`
const saveIgnoreRules = (rules) => {
    const ignoreFilePath = getIgnoreFilePath();
    try {
        fs.writeFileSync(ignoreFilePath, rules.join('\n') + '\n'); // Ensure a newline at the end
        console.log(chalk.green('Changes saved to `.svcignore`.'));
    } catch (error) {
        console.error(chalk.red(`Error saving ignore rules: ${error.message}`));
    }
};

// Validate a pattern
const validatePattern = (pattern) => {
    try {
        if (glob.hasMagic(pattern)) return true; // Ensure it’s a valid glob pattern
        new RegExp(pattern); // Fallback: Test if it's a valid regex
        return true;
    } catch (e) {
        console.error(chalk.red(`Invalid pattern: "${pattern}"`));
        return false;
    }
};

// Preview files affected by `.svcignore` rules
const previewIgnoredFiles = () => {
    console.clear();
    const ignoreRules = loadIgnoreRules();
    const projectDir = process.cwd();

    if (ignoreRules.length === 0) {
        console.log(chalk.yellow('No ignore rules found in `.svcignore`.'));
        return;
    }

    console.log(chalk.cyan('\nPreview of ignored files:'));

    ignoreRules.forEach((rule) => {
        try {
            const matches = glob.sync(rule, { cwd: projectDir, dot: true });
            console.log(chalk.yellow(`\nRule: "${rule}"`));
            if (matches.length === 0) {
                console.log(chalk.gray('  No matching files or directories.'));
            } else {
                matches.forEach((match) => console.log(chalk.green(`  - ${match}`)));
            }
        } catch (err) {
            console.error(chalk.red(`Error processing rule "${rule}": ${err.message}`));
        }
    });
};

// Interactive menu for `.svcignore` management
const editIgnoreRules = async () => {
    let rules = loadIgnoreRules();
    let exit = false;

    while (!exit) {
        console.clear();
        console.log(chalk.cyan('\nCurrent `.svcignore` rules:'));
        if (rules.length === 0) {
            console.log(chalk.yellow('No rules found.'));
        } else {
            rules.forEach((rule, index) => console.log(`${index + 1}. ${rule}`));
        }
        console.log('');

        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: 'Add a new rule', value: 'add' },
                    { name: 'Remove an existing rule', value: 'remove' },
                    { name: 'Preview ignored files', value: 'preview' },
                    { name: 'Back to main menu', value: 'back' },
                    { name: 'Save changes and exit', value: 'save' },
                ],
            },
        ]);

        switch (action) {
            case 'add': {
                const { newRule } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'newRule',
                        message: 'Enter a new ignore pattern (glob or regex):',
                        validate: (input) =>
                            input.trim() !== '' || 'Pattern cannot be empty.',
                    },
                ]);
                if (validatePattern(newRule)) {
                    rules.push(newRule.trim());
                    console.log(chalk.green(`Rule "${newRule}" added.`));
                }
                break;
            }

            case 'remove': {
                if (rules.length === 0) {
                    console.log(chalk.yellow('No rules to remove.'));
                    break;
                }

                const { ruleIndex } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'ruleIndex',
                        message: 'Select a rule to remove:',
                        choices: rules.map((rule, index) => ({
                            name: rule,
                            value: index,
                        })),
                    },
                ]);
                console.log(chalk.red(`Rule "${rules[ruleIndex]}" removed.`));
                rules.splice(ruleIndex, 1);
                break;
            }

            case 'preview': {
                previewIgnoredFiles();
                await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
                break;
            }

            case 'back': {
                console.log(chalk.yellow('Returning to main menu...'));
                exit = true;
                break;
            }

            case 'save': {
                saveIgnoreRules(rules);
                exit = true;
                break;
            }

            default:
                console.log(chalk.red('Invalid option.'));
        }
    }
};

// Export functions
export { editIgnoreRules, loadIgnoreRules, saveIgnoreRules, previewIgnoredFiles };
