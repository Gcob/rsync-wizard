import {DB} from "../features/database.js";
import {spawn} from "child_process";
import chalk from "chalk";
import {exec} from "child_process";
import {promisify} from "util";
import {pressEnterToContinue} from "../features/commons.js";

const execPromise = promisify(exec);

export default class RemoteHost {
    static db = new DB(RemoteHost, 'remote_hosts', 'id', [
        'id',
        'created_at',
        'updated_at',
        'last_connection_at',
        'username',
        'host',
        'port',
        'name',
        'description',
        'root_path',
        'known_directories',
        'private_key_path',
        'use_key_auth',
    ])

    /** @type {number} */
    id = -1;

    /** @type {Date} */
    created_at = new Date();

    /** @type {Date} */
    updated_at = new Date();

    /** @type {Date|null} */
    last_connection_at = null;

    /** @type {string} */
    username = '';

    /** @type {string} */
    host = '';

    /** @type {string} */
    private_key_path = '~/.ssh/id_rsa';

    /** @type {boolean} */
    use_key_auth = false;

    /** @type {number} */
    port = 22;

    /** @type {string} */
    name = '';

    /** @type {string} */
    description = '';

    /** @type {string} */
    root_path = '';

    /** @type {string[]} */
    known_directories = [];

    /** @type {string} */
    currentDirectory = '/';


    /**
     * @param {string} username
     * @param {string} host
     * @param {number} port
     * @param {string} name
     * @param {string} description
     * @param {string} root_path
     * @param {string} private_key_path
     * @param {boolean} use_key_auth
     */
    constructor(username, host, port = 22, name = '', description = '', root_path = '/', private_key_path = '~/.ssh/id_rsa', use_key_auth = true) {
        this.username = username;
        this.host = host;
        this.port = port;
        this.name = name || `${username}@${host}`;
        this.description = description;
        this.root_path = root_path;
        this.private_key_path = private_key_path;
        this.use_key_auth = use_key_auth;
        this.currentDirectory = root_path;
        this.id = RemoteHost.db.getAllModels().sort((a, b) => b.id - a.id)[0]?.id + 1 || 1;
    }


    /**
     * @returns {RemoteHost|null}
     */
    static find(name) {
        return RemoteHost.db.findBy('name', name);
    }

    save() {
        RemoteHost.db.delete(this.id);
        this.updated_at = new Date();
        RemoteHost.db.save(this);
    }

    delete() {
        this.disconnect();
        RemoteHost.db.delete(this.id);
    }

    /**
     * Load SSH key to the SSH agent
     * @returns {Promise<boolean>}
     */
    async loadSSHKeyIfNeeded() {
        if (!this.use_key_auth) {
            console.log(chalk.dim('SSH key authentication is not enabled. Skipping key loading.'));
            return true;
        }

        try {
            console.log(chalk.blue(`Loading SSH key from ${this.private_key_path}...`));

            const agentResult = await execPromise("eval \"$(ssh-agent -s)\"");
            const addResult = await execPromise(`ssh-add ${this.private_key_path}`);

            console.log(chalk.green(`SSH key loaded successfully: ${addResult.stdout.trim()}`));
            return true;
        } catch (error) {
            console.error(chalk.red(`Failed to load SSH key: ${error.message}`));
            return false;
        }
    }

    /**
     * Test SSH connection interactively
     * @returns {Promise<boolean>}
     */
    async testConnectionInteractive() {
        console.log(`Trying SSH connexion to ${this.username}@${this.host}:${this.port}...`);
        await this.loadSSHKeyIfNeeded();

        return new Promise((resolve) => {
            const sshArgs = [
                '-p', `${this.port}`
            ];

            if (this.use_key_auth && this.private_key_path) {
                sshArgs.push('-i', this.private_key_path);
            }

            sshArgs.push(
                `${this.username}@${this.host}`,
                'echo "Test from remote host"',
            );

            const sshProcess = spawn('ssh', sshArgs, {
                stdio: 'inherit'
            });

            sshProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(chalk.bold.green('SSH connection established successfully'));
                    resolve(true);
                } else {
                    console.error(chalk.bold.red(`SSH connection failed with code ${code}`));
                    resolve(false);
                }
            });
        });
    }


    /**
     * Execute a command on the remote host
     * @param {string} command - Command to execute
     * @param {Object} options - Options
     * @param {boolean} options.captureOutput - Whether to capture output (true) or display it directly (false)
     * @returns {Promise<{success: boolean, stdout?: string, stderr?: string, code: number}>}
     */
    async executeCommand(command, options = { captureOutput: false }) {
        await this.loadSSHKeyIfNeeded();
        console.log(chalk.blue(`Executing command on ${this.username}@${this.host}:${this.port}: ${command}`));

        return new Promise((resolve, reject) => {
            const fullCommand = `cd "${this.currentDirectory}" && ${command}`;
            const sshArgs = [
                '-p', `${this.port}`
            ];

            if (this.use_key_auth && this.private_key_path) {
                sshArgs.push('-i', this.private_key_path);
            }

            sshArgs.push(
                `${this.username}@${this.host}`,
                fullCommand
            );

            // Choose stdio configuration based on whether we want to capture output
            const stdioConfig = options.captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit';

            const sshProcess = spawn('ssh', sshArgs, {
                stdio: stdioConfig
            });

            let stdout = '';
            let stderr = '';

            // If capturing output, set up listeners
            if (options.captureOutput) {
                sshProcess.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                sshProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            }

            sshProcess.on('close', (code) => {
                this.last_connection_at = new Date();
                this.save();

                const result = {
                    success: code === 0,
                    code: code
                };

                if (options.captureOutput) {
                    result.stdout = stdout;
                    result.stderr = stderr;
                }

                if (code !== 0) {
                    console.error(chalk.red(`Command failed with code ${code}`));
                }

                resolve(result);
            });

            sshProcess.on('error', (error) => {
                console.error(chalk.bold.red(`SSH Error: ${error.message}`));
                reject(error);
            });
        });
    }
}