import {DB} from "../features/database.js";
import {spawn} from "child_process";
import chalk from "chalk";
import {exec} from "child_process";
import {promisify} from "util";
import {pressEnterToContinue} from "../features/commons.js";
import path from "path";
import inquirer from "inquirer";

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
        'private_key_path',
        'use_key_auth',
        'os',
        'base_local_path',
        'directories_associations'
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

    /** @type {DirectoryAssociation[]} */
    directories_associations = [];

    /** @type {string|null} */
    base_local_path = null;

    /** @type {string} */
    os = 'ubuntu';

    /** @type {string|null} */
    currentDirectory = null;

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
        this.base_local_path = path.join(process.env.DEFAULT_BASE_LOCAL_PATH || process.env.HOME || process.env.USERPROFILE || '');
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

    getCurrentDirectory() {
        return this.currentDirectory || this.root_path;
    }

    getDistantDirectories() {
        return this.directories_associations.map(assoc => assoc.distantPath);
    }

    getLocalDirectories() {
        return this.directories_associations.map(assoc => assoc.localPath);
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
    async executeCommand(command, options = {captureOutput: false}) {
        await this.loadSSHKeyIfNeeded();
        console.log(chalk.blue(`Executing command on ${this.username}@${this.host}:${this.port}: ${command}`));

        // If we need to capture output, use execPromise
        if (options.captureOutput) {
            try {
                const sshCommand = [
                    'ssh',
                    `-p ${this.port}`
                ];

                if (this.use_key_auth && this.private_key_path) {
                    sshCommand.push(`-i ${this.private_key_path}`);
                }

                sshCommand.push(
                    `${this.username}@${this.host}`,
                    `"cd \\"${this.getCurrentDirectory()}\\" && ${command.replace(/"/g, '\\"')}"`
                );

                const finalCommand = sshCommand.join(' ');
                const {stdout, stderr} = await execPromise(finalCommand);

                this.last_connection_at = new Date();
                this.save();

                return {
                    success: true,
                    code: 0,
                    stdout,
                    stderr
                };
            } catch (error) {
                this.last_connection_at = new Date();
                this.save();

                console.error(chalk.red(`Command failed: ${error.message}`));
                return {
                    success: false,
                    code: error.code || 1,
                    stdout: error.stdout || '',
                    stderr: error.stderr || error.message
                };
            }
        }

        // For interactive mode (no output capture), use spawn
        return new Promise((resolve, reject) => {
            const fullCommand = `cd "${this.getCurrentDirectory()}" && ${command}`;
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

            const sshProcess = spawn('ssh', sshArgs, {
                stdio: 'inherit'
            });

            sshProcess.on('close', (code) => {
                this.last_connection_at = new Date();
                this.save();

                resolve({
                    success: code === 0,
                    code: code
                });
            });

            sshProcess.on('error', (error) => {
                console.error(chalk.bold.red(`SSH Error: ${error.message}`));
                reject(error);
            });
        });
    }

    /**
     * Browse and select a directory on the remote host with option to create new directories
     * @param {Object} options - Options
     * @param {number} options.maxDepth - Maximum recursion depth for initial directory scan
     * @param {string} options.startPath - Starting path for browsing (defaults to current directory)
     * @returns {Promise<string>} - Selected directory path
     */
    async browseDirectories(startPath = null, maxDepth = 3) {
        startPath = startPath || this.root_path;

        // Cache of directory structures we've already fetched
        // Key: directory path, Value: { directories: string[], isFullyExplored: boolean }
        const dirCache = new Map();

        /**
         * Create a new directory in the current path
         * @param {string} currentPath - Current directory path
         * @param ask {boolean} - Whether to ask for directory name
         * @returns {Promise<string|null>} - New directory path or null if creation failed
         */
        const createNewDirectory = async (currentPath, ask = true) => {
            const dirName = !ask ? currentPath : (await inquirer.prompt([
                {
                    type: 'input',
                    name: 'dirName',
                    message: 'Enter new directory name:',
                    validate: (input) => {
                        if (!input.trim()) return 'Directory name cannot be empty';
                        if (input.includes('/')) return 'Directory name cannot contain "/"';
                        return true;
                    }
                }
            ])).dirName;

            const newDirPath = ask ? path.join(currentPath, dirName) : currentPath;
            console.log(chalk.blue(`Creating directory ${newDirPath}...`));

            const result = await this.executeCommand(`mkdir -p "${newDirPath}"`, {captureOutput: true});

            if (!result.success) {
                console.error(chalk.red(`Failed to create directory ${newDirPath}`));
                return null;
            }

            console.log(chalk.green(`Directory ${newDirPath} created successfully`));

            if (dirCache.has(currentPath)) {
                const currentDirInfo = dirCache.get(currentPath);
                currentDirInfo.directories.push(newDirPath);
                currentDirInfo.directories.sort();
            }

            return newDirPath;
        };

        /**
         * Fetch directory structure for a given path
         * @param {string} dirPath - Directory path to fetch
         * @param {number} depth - Current recursion depth
         * @returns {Promise<Map<string, {directories: string[], isFullyExplored: boolean}>>}
         */
        const fetchDirectoryStructure = async (dirPath, depth = 0) => {
            console.log(chalk.blue(`Fetching directory structure for ${dirPath}...`));

            // First check if the directory exists
            const checkResult = await this.executeCommand(
                `[ -d "${dirPath}" ] && echo "exists" || echo "not exists"`,
                {captureOutput: true}
            );

            if (!checkResult.success || checkResult.stdout.trim() === "not exists") {
                console.error(chalk.red(`Directory ${dirPath} does not exist`));
                return new Map();
            }

            // Execute ls command with options to show only directories
            const result = await this.executeCommand(
                `find "${dirPath}" -type d -maxdepth ${maxDepth} | sort`,
                {captureOutput: true}
            );

            if (!result.success) {
                console.error(chalk.red(`Failed to fetch directory structure for ${dirPath}`));
                return new Map();
            }

            // Process the directory listing
            const dirs = result.stdout.split('\n')
                .filter(line => line.trim() !== '')
                .filter(line => line !== dirPath); // Remove the root directory itself

            // For each directory, determine if it's fully explored or not
            // A directory is fully explored if its depth from dirPath is less than maxDepth
            const structureMap = new Map();

            // Create entry for the root directory itself
            structureMap.set(dirPath, {
                directories: [],
                isFullyExplored: depth < maxDepth
            });

            // First pass: create basic structure
            for (const dir of dirs) {
                // Calculate relative path segments from dirPath to determine depth
                const relPath = dir.replace(dirPath, '').replace(/^\/+/, '');
                const segments = relPath.split('/').filter(s => s.length > 0);
                const parentPath = segments.length > 1
                    ? path.join(dirPath, ...segments.slice(0, -1))
                    : dirPath;

                // Get or create parent entry
                if (!structureMap.has(parentPath)) {
                    structureMap.set(parentPath, {
                        directories: [],
                        isFullyExplored: segments.length < maxDepth
                    });
                }

                // Add this directory to its parent
                if (segments.length > 0) {
                    structureMap.get(parentPath).directories.push(dir);
                }

                // Create entry for this directory if it doesn't exist
                if (!structureMap.has(dir)) {
                    structureMap.set(dir, {
                        directories: [],
                        isFullyExplored: segments.length < maxDepth - 1
                    });
                }
            }

            return structureMap;
        };

        const initialStructure = await fetchDirectoryStructure(startPath);
        initialStructure.forEach((value, key) => {
            dirCache.set(key, value);
        });

        let currentDir = startPath;
        let selecting = true;

        while (selecting) {
            // Ensure the current directory exists before proceeding
            const checkDirExists = await this.executeCommand(
                `[ -d "${currentDir}" ] && echo "exists" || echo "not exists"`,
                {captureOutput: true}
            );

            // If current directory doesn't exist, go up one level
            if (!checkDirExists.success || checkDirExists.stdout.trim() === "not exists") {
                console.error(chalk.yellow(`Directory ${currentDir} does not exist.`));
                const createDir = (await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'createDir',
                        message: `Do you want to create the directory ${currentDir}?`,
                        default: false
                    }
                ])).createDir

                const fallBackDir = path.dirname(currentDir);

                if (createDir) {
                    const newDir = await createNewDirectory(currentDir, false);

                    if (newDir) {
                        currentDir = newDir;
                    } else {
                        console.error(chalk.red(`Failed to create directory ${currentDir}`));
                        currentDir = fallBackDir;
                    }
                } else {
                    currentDir = fallBackDir;
                }

                continue;
            }

            // Get current directory info from cache or fetch it
            let currentDirInfo = dirCache.get(currentDir);

            if (!currentDirInfo) {
                // If not in cache, fetch just this directory
                const newStructure = await fetchDirectoryStructure(currentDir, 1);
                newStructure.forEach((value, key) => {
                    dirCache.set(key, value);
                });
                currentDirInfo = dirCache.get(currentDir);
            }

            // If this directory was marked as not fully explored and we try to browse it,
            // fetch its full contents now
            if (currentDirInfo && !currentDirInfo.isFullyExplored && currentDirInfo.directories.length > 0) {
                console.log(chalk.yellow(`Loading more subdirectories for ${currentDir}...`));
                const newStructure = await fetchDirectoryStructure(currentDir);
                newStructure.forEach((value, key) => {
                    dirCache.set(key, value);
                });
                currentDirInfo = dirCache.get(currentDir);
            }

            const subdirs = currentDirInfo ? currentDirInfo.directories.sort() : [];

            const choices = [
                {name: '[Select this directory]', value: '__SELECT__'},
                {name: '[Go up one level]', value: '__UP__'},
                {name: '[Manually enter a path]', value: '__MANUAL__'},
                {name: '[Create new directory here]', value: '__NEW__'},
                ...subdirs.map(dir => ({
                    name: `${path.basename(dir)}${!dirCache.get(dir)?.isFullyExplored ? ' (...)' : ''}`,
                    value: dir
                }))
            ];

            if (currentDir === '/') {
                choices.splice(1, 1);
            }

            console.log(chalk.green(`\nCurrent directory: ${currentDir}`));
            const {action} = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'Select a directory:',
                    pageSize: 14,
                    choices
                }
            ]);

            switch (action) {
                case '__SELECT__':
                    selecting = false;
                    this.currentDirectory = currentDir;
                    this.save();
                    console.log(chalk.green(`Selected directory: ${currentDir}`));
                    break;
                case '__UP__':
                    currentDir = path.dirname(currentDir);
                    break;
                case '__NEW__':
                    const newDir = await createNewDirectory(currentDir);
                    if (newDir) {
                        currentDir = newDir;
                    }
                    break;
                case '__MANUAL__':
                    const {manualPath} = await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'manualPath',
                            message: 'Enter the full path of the directory:',
                            default: currentDir,
                            validate: (input) => {
                                if (!input.trim()) return 'Directory path cannot be empty';
                                return true;
                            }
                        }
                    ]);
                    currentDir = manualPath;
                    break;
                default:
                    currentDir = action;
                    break;
            }
        }

        return currentDir;
    }
}