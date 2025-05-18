import inquirer from "inquirer";
import RemoteHost from "../models/RemoteHost.js";
import chalk from "chalk";

export class RsyncCommand {
    /** @type {boolean} */
    isPush = false;

    /** @type {RemoteHost} */
    remoteHost = null;

    async askPrompts() {
        await this.askPrompts__getRemoteHost();
        await this.askPrompts__handleRemoteHost();
    }

    async askPrompts__handleRemoteHost() {
        const remoteName = this.remoteHost?.name || 'remote host';

        const choice = (await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'choice',
                message: 'What do you want to do?',
                choices: [
                    {name: `Pull from remote host`, value: 'pull'},
                    {name: `Push to remote host`, value: 'push'},
                    new inquirer.Separator(),
                    {name: `Start remote host connection`, value: 'startConnection'},
                    {name: `Test connection to remote host`, value: 'testConnection'},
                    new inquirer.Separator(),
                    {name: `See remote host details`, value: 'details'},
                    {name: `Edit remote host details`, value: 'edit'},
                    {name: `Delete remote host`, value: 'delete'},
                ],
            },
        ])).choice;

        switch (choice) {
            case 'pull':
                this.isPush = false;
                break;
            case 'push':
                this.isPush = true;
                break;
            case 'details':
                this.showRemoteHostDetails();
                await this.pressEnterToContinue();
                await this.askPrompts__handleRemoteHost();
                break;
            case 'edit':
                await this.askPrompts__editRemoteHost();
                break;
            case 'delete':
                const confirmDelete = (await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirmDelete',
                        message: `Are you sure you want to delete ${remoteName}?`,
                        default: false,
                    },
                ])).confirmDelete;

                if (confirmDelete) {
                    await this.remoteHost.delete();
                    console.log(`Remote remoteHost ${this.remoteHost.name} deleted!`);
                    this.showRemoteHostDetails();
                    await this.pressEnterToContinue();
                    return;
                } else {
                    await this.askPrompts__handleRemoteHost();
                }

                break;
            case 'startConnection':
                if (!this.remoteHost) {
                    console.log(chalk.bold.red('No remote host selected!'));
                } else {
                    await this.remoteHost.sshConnect()
                    console.log(chalk.bold(`Connection to ${remoteName} finished!`));
                    await this.pressEnterToContinue();
                }
                await this.askPrompts__handleRemoteHost();
                break;
            case 'testConnection':
                if (!this.remoteHost) {
                    console.log(chalk.bold.red('No remote host selected!'));
                } else {
                    await this.remoteHost.testConnectionInteractive()
                    await this.pressEnterToContinue();
                }
                await this.askPrompts__handleRemoteHost();
                break;
            default:
                throw new Error('Option not found');
        }
    }

    async askPrompts__getRemoteHost() {
        const remoteHosts = await RemoteHost.db.getAllModels();
        const choices = remoteHosts.map(host => ({
            name: host.name,
            value: host.name,
        }));

        choices.push({name: 'Add a remote remoteHost', value: 'new'});

        const choice = (await inquirer.prompt([
            {
                type: 'list',
                name: 'choice',
                message: 'Please select a remote remoteHost:',
                choices,
            },
        ])).choice;

        if (choice === 'new') {
            await this.askPrompts__editRemoteHost(true);
        } else {
            this.remoteHost = RemoteHost.find(choice);
        }
    }

    async askPrompts__editRemoteHost(isCreation) {
        if (isCreation) {
            console.log('Creating a new remote host...');
            this.remoteHost = null
        } else {
            if (!this.remoteHost) {
                console.log(chalk.bold.red('No remote host selected!'));
                return;
            }

            console.log(`Editing remote host ${this.remoteHost.name}...`);
        }

        const userName = (await inquirer.prompt([
            {
                type: 'input',
                name: 'username',
                message: 'Please enter the username:',
                default: this.remoteHost?.username,
            },
        ])).username;

        const host = (await inquirer.prompt([
            {
                type: 'input',
                name: 'host',
                message: 'Please enter the host:',
                default: this.remoteHost?.host,
            },
        ])).host;

        if (isCreation) {
            this.remoteHost = new RemoteHost(userName, host);
        } else {
            this.remoteHost.username = userName;
            this.remoteHost.host = host;
        }

        this.remoteHost.port = (await inquirer.prompt([
            {
                type: 'input',
                name: 'port',
                message: 'Please enter the port:',
                default: this.remoteHost.port,
            },
        ])).port;

        this.remoteHost.name = (await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: 'Please enter the name:',
                default: this.remoteHost.name,
            },
        ])).name;

        this.remoteHost.description = (await inquirer.prompt([
            {
                type: 'input',
                name: 'description',
                message: 'Please enter the description:',
                default: this.remoteHost.description,
            },
        ])).description;

        const wantToSelectRootPath = (await inquirer.prompt([
            {
                type: 'confirm',
                name: 'wantToSelectRootPath',
                message: 'Do you want to select the root path?',
                default: false,
            },
        ])).wantToSelectRootPath;

        if (wantToSelectRootPath) {
            await this.askPrompts__selectRootPath();
        }

        this.showRemoteHostDetails()

        const askToSave = (await inquirer.prompt([
            {
                type: 'confirm',
                name: 'askToSave',
                message: `Do you want to save the remote host ${this.remoteHost.name}?`,
                default: true,
            },
        ])).askToSave;

        if (!askToSave) {
            console.log(chalk.bold.red(`Remote remoteHost ${this.remoteHost.name} not saved!`));
            return;
        }

        this.remoteHost.save()

        if (isCreation) {
            console.log(chalk.bold.green(`Remote remoteHost ${this.remoteHost.name} created!`));
        } else {
            console.log(chalk.bold.green(`Remote remoteHost ${this.remoteHost.name} updated!`));
        }
    }

    showRemoteHostDetails() {
        // const description = this.remoteHost.description
        //     ? chalk.bold(this.remoteHost.description)
        //     : chalk.dim('No description');
        //
        // console.log(`Username: ${chalk.bold(this.remoteHost.username)}`);
        // console.log(`Host: ${chalk.bold(this.remoteHost.host)}`);
        // console.log(`Port: ${chalk.bold(this.remoteHost.port)}`);
        // console.log(`Description: ${description}`);
        // console.log(`Root path: ${chalk.bold(this.remoteHost.root_path)}`);

        console.log(this.remoteHost)
    }

    async askPrompts__selectRootPath() {
        if (!this.remoteHost) {
            console.log(chalk.bold.red('No remote host selected!'));
            return;
        }

        this.remoteHost.root_path = (await inquirer.prompt([
            {
                type: 'input',
                name: 'root_path',
                message: 'Please enter the root path:',
                default: this.remoteHost.root_path,
            },
        ])).root_path;
    }

    async pressEnterToContinue() {
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: 'Press Enter to continue...',
            },
        ]);
        console.clear();
    }
}