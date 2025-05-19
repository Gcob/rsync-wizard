import {DB} from "../features/database.js";
import {spawn} from "child_process";
import chalk from "chalk";
import {exec} from "child_process";
import {promisify} from "util";

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

    /** @type {'initial'|'error'|'success'|'connected'|'disconnected'} */
    status = 'initial';

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

    /** @type {import('child_process').ChildProcess|null} */
    activeConnection = null;

    /** @type {string} */
    currentDirectory = '';

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

    getStatus() {
        let emojis = {
            'initial': '🌀',
            'error': '❌',
            'success': '✅',
            'connected': '🔗',
            'disconnected': '🔌'
        }

        return `${emojis[this.status]} ${this.status.charAt(0).toUpperCase() + this.status.slice(1)}`;
    }

    /**
     * Load SSH key to the SSH agent
     * @returns {Promise<boolean>}
     */
    async loadSSHKey() {
        if (!this.use_key_auth) {
            console.log(chalk.dim('SSH key authentication is not enabled.'));
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
        await this.loadSSHKey();

        return new Promise((resolve) => {
            const sshArgs = [
                '-p', `${this.port}`
            ];

            // Add identity file option if using key authentication
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
                    this.status = 'success';
                    this.save();
                    resolve(true);
                } else {
                    console.error(chalk.bold.red(`SSH connection failed with code ${code}`));
                    this.status = 'error';
                    this.save();
                    resolve(false);
                }
            });
        });
    }

    /**
     * Start a persistent SSH connection in background
     * @returns {Promise<boolean>}
     */
    async connect() {
        if (this.activeConnection && this.status === 'connected') {
            console.log(chalk.bold.yellow('Already connected!'));
            return true;
        }

        try {
            console.log(chalk.bold.blue(`Starting a background connection to ${this.username}@${this.host}:${this.port}...`));
            await this.loadSSHKey();

            const sshArgs = [
                '-tt',  // Force pseudo-terminal allocation
                '-p', `${this.port}`
            ];

            if (this.use_key_auth && this.private_key_path) {
                sshArgs.push('-i', this.private_key_path);
            }

            sshArgs.push(`${this.username}@${this.host}`);

            this.activeConnection = spawn('ssh', sshArgs, {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            if (this.root_path && this.root_path !== '/') {
                await this.executeCommand(`cd ${this.root_path}`);
                this.currentDirectory = this.root_path;
            }

            let resolve = null;
            const connectionPromise = new Promise((res) => {
                resolve = res;
            })

            this.activeConnection.stdout.on('data', (data) => {
                console.log(chalk.dim(`[${this.name}] (STDOUT): `) + data.toString());
                resolve(true)
            });

            this.activeConnection.stderr.on('data', (data) => {
                console.log(chalk.dim(`[${this.name}] (STDERR): `) + data.toString());
                resolve(false)
            });

            this.activeConnection.on('error', (error) => {
                console.error(chalk.bold.red(`Error during SSH connection: ${error.message}`));
                this.status = 'error';
                this.activeConnection = null;
                resolve(false)
            });

            this.activeConnection.on('close', (code) => {
                this.status = 'disconnected';
                this.activeConnection = null;

                if (code === 0) {
                    console.log(chalk.bold.green(`SSH connection closed successfully`));
                } else {
                    console.log(chalk.bold.red(`SSH connection closed with code ${code}`));
                }

                resolve(false)
            });

            await connectionPromise;
            await new Promise((resolve) => setTimeout(resolve, 250));
            console.clear()
            console.log(chalk.bold.green(`Successfully connected to ${this.username}@${this.host}:${this.port}`));
        } catch (error) {
            console.error(chalk.bold.red(`Error during SSH connection: ${error.message}`));
            this.status = 'error';
            this.activeConnection = null;
            return false;
        }

        this.status = 'connected';
        this.last_connection_at = new Date();
        this.save();

        console.clear()
        console.log(chalk.bold.green(`Successfully connected to ${this.username}@${this.host}:${this.port}`));

        return true;
    }

    /**
     * Disconnect the active SSH connection
     * @returns {object} Result of the disconnection
     */
    async disconnect() {
        if (!this.activeConnection) {
            console.log(chalk.bold.yellow('No active connection to disconnect'));
            return true
        }

        try {
            console.log(chalk.bold.blue(`Disconnecting from ${this.username}@${this.host}:${this.port}...`));

            this.activeConnection.stdin.write('exit\n');
            await new Promise((resolve) => {
                setTimeout(() => {
                    if (this.activeConnection) {
                        console.log(chalk.dim('Forcing disconnection...'));
                        this.activeConnection.kill();
                        this.activeConnection = null;
                        this.status = 'disconnected';
                        this.save();
                    }

                    resolve();
                }, 500);
            })

            // no console.log is needed, because there already is a callback in the on('close') event handling the disconnection
            return true
        } catch (error) {
            console.error(`Error during disconnection: ${error.message}`);

            if (this.activeConnection) {
                console.log(chalk.bold.red(`Forcefully disconnected from ${this.username}@${this.host}:${this.port}`));
                this.activeConnection.kill('SIGKILL');
                this.activeConnection = null;
            }

            this.status = 'error';
            this.save();

            return false
        }
    }

    /**
     * Execute a command on the active SSH connection
     * @param {string} command The command to execute
     * @returns {Promise<object>} The command execution result
     */
    async executeCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.activeConnection || this.status !== 'connected') {
                reject(new Error('No active SSH connection'));
                return;
            }

            let output = '';
            let errorOutput = '';

            // Create output collectors
            const onData = (data) => {
                output += data.toString();
            };

            const onError = (data) => {
                errorOutput += data.toString();
            };

            // Set up temporary listeners
            this.activeConnection.stdout.on('data', onData);
            this.activeConnection.stderr.on('data', onError);

            // Send the command
            this.activeConnection.stdin.write(`${command}\n`);

            // Add a special marker to determine when command is complete
            const marker = `__COMMAND_COMPLETED_${Date.now()}__`;
            this.activeConnection.stdin.write(`echo "${marker}"\n`);

            // Wait for marker to appear in output
            const checkInterval = setInterval(() => {
                if (output.includes(marker)) {
                    clearInterval(checkInterval);

                    // Remove listeners
                    this.activeConnection.stdout.removeListener('data', onData);
                    this.activeConnection.stderr.removeListener('data', onError);

                    // Process output
                    const finalOutput = output.substring(0, output.indexOf(marker)).trim();

                    // Update current directory if command is cd
                    if (command.trim().startsWith('cd ')) {
                        const newDir = command.trim().substring(3).trim();

                        if (newDir.startsWith('/')) {
                            this.currentDirectory = newDir;
                        } else if (newDir === '..') {
                            this.currentDirectory = this.currentDirectory.split('/').slice(0, -1).join('/') || '/';
                        } else {
                            this.currentDirectory = this.currentDirectory === '/' ?
                                `/${newDir}` : `${this.currentDirectory}/${newDir}`;
                        }
                    }

                    resolve({
                        success: true,
                        output: finalOutput,
                        error: errorOutput,
                        directory: this.currentDirectory
                    });
                }
            }, 100);

            // Set timeout
            setTimeout(() => {
                clearInterval(checkInterval);
                this.activeConnection.stdout.removeListener('data', onData);
                this.activeConnection.stderr.removeListener('data', onError);
                reject(new Error('Command execution timed out'));
            }, 30000); // 30 seconds timeout
        });
    }

    /**
     * Get current working directory
     * @returns {Promise<string>} The current directory
     */
    async getCurrentDirectory() {
        try {
            const result = await this.executeCommand('pwd');
            if (result.success) {
                this.currentDirectory = result.output.trim();
                return this.currentDirectory;
            }
            return this.currentDirectory;
        } catch (error) {
            console.error(`Error getting current directory: ${error.message}`);
            return this.currentDirectory;
        }
    }
}