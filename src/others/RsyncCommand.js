import inquirer from "inquirer";
import RemoteHost from "../models/RemoteHost.js";

export class RsyncCommand {
    /** @type {boolean} */
    isPush = false;

    /** @type {RemoteHost} */
    remoteHost = null;

    async askPrompts() {
        await this.askPrompts__getRemoteHost();
        await this.askPrompts__selectRootPath();
        await this.askPrompts__handleRemoteHost();
    }

    async askPrompts__handleRemoteHost() {
        const remoteName = this.remoteHost?.name || 'remote host';

        const choice = (await inquirer.prompt([
            {
                type: 'list',
                name: 'choice',
                message: 'What do you want to do?',
                choices: [
                    {name: `Pull from ${remoteName}`, value: 'pull'},
                    {name: `Push to ${remoteName}`, value: 'push'},
                    new inquirer.Separator(),
                    {name: `Start ${remoteName} connection`, value: 'startConnection'},
                    {name: `Test connection to ${remoteName}`, value: 'testConnection'},
                    new inquirer.Separator(),
                    {name: `See ${remoteName} details`, value: 'details'},
                    {name: `Edit ${remoteName} details`, value: 'edit'},
                    {name: `Delete ${remoteName}`, value: 'delete'},
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
                    return;
                } else {
                    await this.askPrompts__handleRemoteHost();
                }

                break;
            case 'startConnection':
                await this.remoteHost.sshConnect()
                console.log(`Connection to ${remoteName} finished!`);
                await this.askPrompts__handleRemoteHost();
                break;
            case 'testConnection':
                await this.remoteHost.testConnectionInteractive()
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

        if (isCreation) {
            console.log(`Remote remoteHost ${this.remoteHost.name} created!`);
        } else {
            console.log(`Remote remoteHost ${this.remoteHost.name} updated!`);
        }

        this.remoteHost.save()
    }

    showRemoteHostDetails() {
        console.log(`Username: ${this.remoteHost.username}`);
        console.log(`Host: ${this.remoteHost.host}`);
        console.log(`Port: ${this.remoteHost.port}`);
        console.log(`Description: ${this.remoteHost.description}`);
        console.log(`Root path: ${this.remoteHost.root_path}`);
    }

    async askPrompts__selectRootPath() {

    }
}