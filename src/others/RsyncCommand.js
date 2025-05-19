import inquirer from "inquirer";
import RemoteHost from "../models/RemoteHost.js";
import chalk from "chalk";
import fs from "fs";
import {pressEnterToContinue} from "../features/commons.js";
import DirectoryAssociation from "../models/DirectoryAssociation.js";
import * as child_process from "node:child_process";

export class RsyncCommand {
    /** @type {boolean} */
    isPush = false;

    /** @type {RemoteHost} */
    remoteHost = null;

    /** @type {string} */
    distantDirectory = '';

    /** @type {string} */
    localDirectory = '';

    /** @type {boolean} */
    verbose = false;

    /** @type {boolean} */
    archive = true;

    /** @type {boolean} */
    compress = true;

    /** @type {boolean} */
    delete = false;

    /** @type {boolean} */
    dryRun = false;

    /** @type {boolean} */
    progress = true;

    async buildAndExecute() {
        await this.buildAndExecute__getRemoteHost();
        await this.buildAndExecute__handleRemoteHost();
        await this.buildAndExecute__askForDistantDirectory();
        await this.buildAndExecute__askForLocalDirectory();
        await this.buildAndExecute__askForOptions();
        await this.buildAndExecute__askToExecute();
    }

    async buildAndExecute__handleRemoteHost() {
        if (!this.remoteHost) {
            console.log(chalk.bold.red('No remote host selected!'));
            return;
        }

        console.log(chalk.bold(`Remote Host`) + ` : ${this.remoteHost.name}`);

        if (this.remoteHost.description) {
            console.log(chalk.bold(`Description`) + ` : ${this.remoteHost.description}`);
        }

        const choices = [
            {name: `Pull`, value: 'pull'},
            {name: `Push`, value: 'push'},
            new inquirer.Separator(),
            {name: `Execute SSH command`, value: 'executeCommand'},
            {name: `Test SSH`, value: 'testConnection'},
            new inquirer.Separator(),
            {name: `See details`, value: 'details'},
            {name: `Edit details`, value: 'edit'},
            {name: chalk.red(`Delete`), value: 'delete'},
        ]

        const choice = (await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'choice',
                message: 'What do you want to do?',
                choices,
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
                await pressEnterToContinue();
                await this.buildAndExecute__handleRemoteHost();
                break;
            case 'edit':
                await this.buildAndExecute__editRemoteHost();
                break;
            case 'delete':
                const confirmDelete = (await inquirer.prompt([{
                    type: 'confirm',
                    name: 'confirmDelete',
                    message: `Are you sure you want to delete ${this.remoteHost.name}?`,
                    default: false,
                }])).confirmDelete;

                if (confirmDelete) {
                    await this.remoteHost.delete();
                    console.log(`Remote remoteHost ${this.remoteHost.name} deleted!`);
                    this.showRemoteHostDetails();
                    await pressEnterToContinue();
                    return;
                } else {
                    await this.buildAndExecute__handleRemoteHost();
                }

                break;
            case 'executeCommand':
                console.log(chalk.bold(`Directory`) + ` : ${this.remoteHost.getCurrentDirectory()}`);

                const command = (await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'command',
                        message: 'Please enter the command to execute:',
                        default: 'pwd',
                    },
                ])).command;

                await this.remoteHost.executeCommand(command);
                await pressEnterToContinue();
                await this.buildAndExecute__handleRemoteHost();
            case 'testConnection':
                await this.remoteHost.testConnectionInteractive()
                await pressEnterToContinue();
                await this.buildAndExecute__handleRemoteHost();
                break;
            default:
                throw new Error('Option not found');
        }
    }

    async buildAndExecute__getRemoteHost() {
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
            await this.buildAndExecute__editRemoteHost(true);
        } else {
            this.remoteHost = RemoteHost.find(choice);
        }
    }

    async buildAndExecute__editRemoteHost(isCreation) {
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

        const sshDir = process.env.HOME + '/.ssh';
        const files = fs.readdirSync(sshDir);
        const privateKeyFiles = files.filter(file => !file.endsWith('.pub'));
        const privateKeyChoices = privateKeyFiles.map(file => ({
            name: file,
            value: sshDir + '/' + file,
        }));

        console.log(chalk.bold.blue('Available private keys:'));

        this.remoteHost.private_key_path = (await inquirer.prompt([
            {
                type: 'list',
                name: 'private_key_path',
                message: 'Please enter the private key path:',
                default: this.remoteHost.private_key_path,
                choices: privateKeyChoices,
            },
        ])).private_key_path;

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
            await this.buildAndExecute__selectRootPath();
        }

        // base_local_path
        this.remoteHost.base_local_path = (await inquirer.prompt([
            {
                type: 'input',
                name: 'base_local_path',
                message: 'Please enter the base local path:',
                default: this.remoteHost.base_local_path,
            }
        ])).base_local_path;

        console.log(chalk.bold.blue(`Remote remoteHost ${this.remoteHost.name} is ready to be saved!`));

        const askToSave = (await inquirer.prompt([
            {
                type: 'confirm',
                name: 'askToSave',
                message: `Do you want to save ${this.remoteHost.name}?`,
                default: true,
            },
        ])).askToSave;

        console.clear();

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

    async buildAndExecute__selectRootPath() {
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


    async buildAndExecute__askForDistantDirectory() {
        const choices = []

        if (this.remoteHost.getDistantDirectories().length) {
            for (const directory of this.remoteHost.getDistantDirectories()) {
                choices.push({name: directory, value: directory});
            }
        }

        choices.push({name: 'Add a new directory', value: 'new'});

        const choice = (await inquirer.prompt([
            {
                type: 'list',
                name: 'directory',
                message: 'Please select a directory:',
                choices,
            },
        ])).directory;

        if (choice === 'new') {
            const newDirectory = await this.remoteHost.browseDirectories(this.remoteHost.root_path)
            const index = this.remoteHost.getDistantDirectories().indexOf(newDirectory);
            if (index === -1) {
                this.remoteHost.directories_associations.push(new DirectoryAssociation(newDirectory));
                this.remoteHost.save();
            }
            this.remoteHost.currentDirectory = newDirectory;
            console.log(chalk.bold.green(`Directory ${newDirectory} added!`));
        } else {
            this.remoteHost.currentDirectory = choice;
            console.log(chalk.bold.green(`Directory ${choice} selected!`));
        }
    }

    async buildAndExecute__askForLocalDirectory() {
        /** @type {DirectoryAssociation|null} */
        const da = this.remoteHost.directories_associations.find((da) => {
            return da.distantPath === this.remoteHost.currentDirectory
        });

        const currentProcessDirectory = da?.localPath || this.remoteHost.base_local_path;

        this.localDirectory = (await inquirer.prompt([
            {
                type: 'input',
                name: 'localDirectory',
                message: 'Please enter the local directory:',
                default: currentProcessDirectory,
            },
        ])).localDirectory;

        da.localPath = this.localDirectory;
    }

    async buildAndExecute__askForOptions() {
        const options = (await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'options',
                message: 'Please select the options:',
                choices: [
                    {name: 'Verbose', value: 'verbose', checked: this.verbose},
                    {name: 'Archive', value: 'archive', checked: this.archive},
                    {name: 'Compress', value: 'compress', checked: this.compress},
                    {name: 'Delete', value: 'delete', checked: this.delete},
                    {name: 'Dry Run', value: 'dryRun', checked: this.dryRun},
                    {name: 'Progress', value: 'progress', checked: this.progress},
                ],
            },
        ])).options;

        this.verbose = options.includes('verbose');
        this.archive = options.includes('archive');
        this.compress = options.includes('compress');
        this.delete = options.includes('delete');
        this.dryRun = options.includes('dryRun');
        this.progress = options.includes('progress');

        console.log(chalk.bold.green(`Options selected!`));

    }

    toString() {
        const optionsStr = ''
            + (this.verbose ? ' -v' : '')
            + (this.archive ? ' -a' : '')
            + (this.compress ? ' -z' : '')
            + (this.delete ? ' --delete' : '')
            + (this.dryRun ? ' --dry-run' : '')
            + (this.progress ? ' --progress' : '');

        const sshOptions = ' -e "ssh -i ' + this.remoteHost.private_key_path + ' -p ' + this.remoteHost.port + '"';

        const distantDirectory = this.remoteHost.username + '@' + this.remoteHost.host + ':' + this.remoteHost.currentDirectory;

        const src = this.isPush ? this.localDirectory : distantDirectory;
        const dest = this.isPush ? distantDirectory : this.localDirectory;

        const rtrim = (str) => str.replace(/\/+$/, '');

        return `rsync ${optionsStr} ${sshOptions} ${rtrim(src)}/ ${rtrim(dest)}/`;
    }

    async buildAndExecute__askToExecute() {
        console.log(chalk.bold.blue(`Remote remoteHost ${this.remoteHost.name} is ready to be used!`));
        console.log(chalk.bold(this.toString()));

        if (this.isPush) {
            console.log(chalk.bold.yellow(`This command will overwrite DISTANT files in ${this.remoteHost.username}@${this.remoteHost.host}:${this.remoteHost.currentDirectory}`));
        } else {
            console.log(chalk.bold.yellow(`This command will overwrite LOCAL in ${this.localDirectory}`));
        }

        const readyToExecute = (await inquirer.prompt([
            {
                type: 'confirm',
                name: 'readyToExecute',
                message: `Do you want to execute the command?`,
                default: true,
            },
        ])).readyToExecute;

        if (readyToExecute) {
            console.log(chalk.bold.blue(`Executing command...`));
            await child_process.exec(this.toString(), (error, stdout, stderr) => {
                if (error) {
                    console.error(chalk.bold.red(`Error: ${error.message}`));
                    return;
                }
                if (stderr) {
                    console.error(chalk.bold.red(`stderr: ${stderr}`));
                    return;
                }
                console.log(chalk.bold.green(`stdout: ${stdout}`));
            });
        }

        await pressEnterToContinue()
    }
}