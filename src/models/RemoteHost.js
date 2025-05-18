import {spawn} from 'child_process';
import ORMModel from "../orm/ORMModel";

export default class RemoteSshHost extends ORMModel {
    constructor(username, host, port = 22, name = '', description = '') {
        super('sshHosts');
        this.username = username;
        this.host = host;
        this.port = port;
        this.name = name || `${username}@${host}:${port}`;
        this.description = description;
        this.lastConnected = null;
        this.status = 'unknown'; // unknown, connected, failed
    }

    /**
     * Test SSH connection
     * @returns {Promise<unknown>}
     */
    async isConnexionEnabled() {
        return new Promise((resolve, reject) => {
            const sshProcess = spawn('ssh', [
                '-p', `${this.port}`,
                `${this.username}@${this.host}`,
                'exit'
            ], {
                stdio: ['inherit', 'pipe', 'pipe']
            });

            let stdoutData = '';
            let stderrData = '';

            sshProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log(`SSH stdout: ${output}`);
                stdoutData += output;
            });

            sshProcess.stderr.on('data', (data) => {
                const output = data.toString();
                console.log(`SSH stderr: ${output}`);
                stderrData += output;
            });

            sshProcess.on('close', (code) => {
                console.log(`SSH process exited with code ${code}`);

                if (code === 0) {
                    resolve({
                        success: true,
                        message: 'SSH connection established successfully',
                        stdout: stdoutData
                    });
                } else {
                    if (stderrData.includes('Are you sure you want to continue connecting')) {
                        resolve({
                            success: false,
                            interactive: true,
                            message: 'SSH connection requires user interaction',
                            stderr: stderrData
                        });
                    } else {
                        reject({
                            success: false,
                            message: `SSH connection failed with code ${code}`,
                            code: code,
                            stderr: stderrData
                        });
                    }
                }
            });

            sshProcess.on('error', (err) => {
                reject({
                    success: false,
                    message: `SSH process error: ${err.message}`,
                    error: err
                });
            });
        });
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


    ////////////////////////////////////////////////////////////////////////
    //////////////////////          lowdb          /////////////////////////
    ////////////////////////////////////////////////////////////////////////


    /**
     * Find all SSH hosts
     * @returns {Array}
     */
    static findAllHosts() {
        return RemoteSshHost.findAll('sshHosts');
    }

    /**
     * Find SSH host by ID
     * @param name
     * @returns {*|null}
     */
    static findByName(name) {
        const hosts = RemoteSshHost.findWhere('sshHosts', host => host.name === name);
        return hosts.length > 0 ? hosts[0] : null;
    }
}