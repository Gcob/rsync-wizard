import inquirer from "inquirer";
import RemoteHost from "../models/RemoteHost.js";

export class RsyncCommand {
    /** @type {boolean} */
    isPush = false;

    /** @type {RemoteHost} */
    host = null;

    async askPrompts() {
        await this.askPrompts__setIsPush();
        await this.askPrompts__getRemoteHost();
    }

    async askPrompts__setIsPush() {
        const choice = (await inquirer.prompt([
            {
                type: 'list',
                name: 'choice',
                message: 'What do you want to do?',
                choices: [
                    {name: 'Pull from remote', value: 'pull'},
                    {name: 'Push to remote', value: 'push'},
                    {name: 'Exit', value: 'exit'},
                ],
            },
        ])).choice;

        if (choice === 'exit') {
            throw new Error('exit')
        }

        this.isPush = choice === 'push';
    }

    async askPrompts__getRemoteHost() {
        const remoteHosts = await RemoteHost.db.getAllModels();
        const choices = remoteHosts.map(host => ({
            name: host.name,
            value: host.name,
        }));

        choices.push({name: 'Add a remote host', value: 'new'});

        const choice = (await inquirer.prompt([
            {
                type: 'list',
                name: 'choice',
                message: 'Please select a remote host:',
                choices,
            },
        ])).choice;

        console.log(`You selected: ${choice}`);
    }
}