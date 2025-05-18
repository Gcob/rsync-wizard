import {DB} from "../features/database.js";
import {spawn} from "child_process";

export default class RemoteHost {
    static db = new DB(RemoteHost, 'remote_hosts')

    /** @type {number} */
    id = -1;

    /** @type {Date} */
    created_at = new Date();

    /** @type {Date} */
    updated_at = new Date();

    /** @type {Date|null} */
    last_connection_at = null;

    /** @type {'initial'|'error'|'success'} */
    status = 'initial';

    /** @type {string} */
    username = '';

    /** @type {string} */
    host = '';

    /** @type {number} */
    port = 22;

    /** @type {string} */
    name = '';

    /** @type {string} */
    description = '';

    /** @type {string} */
    root_path = '';

    constructor(username, host, port = 22, name = '', description = '', root_path = '/') {
        this.id = RemoteHost.db.getAllModels().length + 1;
        this.username = username;
        this.host = host;
        this.port = port;
        this.name = name || `${username}@${host}`;
        this.description = description;
        this.root_path = root_path;
    }


    /**
     * @returns {RemoteHost|null}
     */
    static find(name) {
        return RemoteHost.db.findBy('name', name);
    }

    save() {
        this.delete()
        this.updated_at = new Date();
        RemoteHost.db.save(this);
    }

    delete() {
        RemoteHost.db.delete(this.id);
    }

    /**
     * Test SSH connection interactively
     * @returns {Promise<unknown>}
     */
    async testConnectionInteractive() {
        console.log(`Trying SSH connexion to ${this.username}@${this.host}:${this.port}...`);

        return new Promise((resolve) => {
            const sshProcess = spawn('ssh', [
                '-p', `${this.port}`,
                `${this.username}@${this.host}`,
                'echo "SSH connection established successfully"'
            ], {
                stdio: 'inherit'
            });

            sshProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        message: 'SSH connection established successfully'
                    });
                } else {
                    resolve({
                        success: false,
                        message: `SSH connection failed with code ${code}`,
                    });
                }
            });
        });
    }

    async sshConnect() {
        console.log(`Starting a connection to ${this.username}@${this.host}:${this.port}...`);

        this.status = 'initial';
        this.last_connection_at = new Date();
        this.save();

        return new Promise((resolve, reject) => {
            try {
                const sshArgs = [
                    '-p', `${this.port}`,
                    `${this.username}@${this.host}`
                ];

                if (this.root_path && this.root_path !== '/') {
                    sshArgs.push(`cd ${this.root_path} && bash --login`);
                }

                const sshProcess = spawn('ssh', sshArgs, {
                    stdio: ['inherit', 'inherit', 'inherit'],
                    shell: true
                });

                sshProcess.on('error', (error) => {
                    console.error(`Error during SSH connection: ${error.message}`);
                    this.status = 'error';
                    this.save();
                    reject(error);
                });

                sshProcess.on('close', (code) => {
                    console.log(`Connection closed with code ${code}`);

                    if (code === 0) {
                        this.status = 'success';
                        this.save();
                        resolve({
                            success: true,
                            message: 'Successfully connected to the remote host'
                        });
                    } else {
                        this.status = 'error';
                        this.save();
                        resolve({
                            success: false,
                            message: `SSH connection failed with code ${code}`,
                        });
                    }
                });
            } catch (error) {
                console.error(`Error during SSH connection: ${error.message}`);
                this.status = 'error';
                this.save();
                reject(error);
            }
        });
    }
}