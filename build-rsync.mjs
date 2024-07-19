import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import {fileURLToPath} from 'url';

// Obtenir le répertoire du script en cours d'exécution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Utiliser le chemin relatif au projet pour le fichier d'historique
const historyFile = path.resolve(__dirname, 'rsync_history.json');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (question) => {
    return new Promise((resolve) => rl.question(question, resolve));
};

const validateChoice = (input, validChoices, defaultValue) => {
    if (input === '') return defaultValue;
    if (validChoices.includes(input)) return input;
    console.log(chalk.red('Choix invalide. Veuillez réessayer.'));
    return null;
};

const formatDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const getKnownHosts = async () => {
    try {
        const data = await fs.readFile(historyFile, 'utf-8');
        const history = JSON.parse(data);
        const hosts = new Set();
        history.forEach(entry => {
            if (entry.host) {
                hosts.add(entry.host);
            }
        });
        return Array.from(hosts);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        } else {
            throw error;
        }
    }
};

const buildRsyncCommand = async () => {
    const currentDir = process.cwd();
    const knownHosts = await getKnownHosts();

    let type;
    do {
        const typeInput = await askQuestion('Quel type de synchronisation? (Choix: push,pull,local) ' + chalk.yellow('[default=push] '));
        type = validateChoice(typeInput, ['push', 'pull', 'local'], 'push');
    } while (!type);

    let deleteFlag;
    do {
        const deleteInput = await askQuestion('Est-ce qu\'on supprime les fichier qui ne sont plus présent dans la source? (ajout de --delete) ' + chalk.gray('(Choix: o,n,y,t,f,oui,non,yes,no,true,false) ') + chalk.yellow('[default=n] '));
        deleteFlag = validateChoice(deleteInput.toLowerCase(), ['o', 'n', 'y', 't', 'f', 'oui', 'non', 'yes', 'no', 'true', 'false'], 'n');
    } while (!deleteFlag);
    const deleteOption = ['o', 'y', 't', 'oui', 'yes', 'true'].includes(deleteFlag) ? '--delete' : '';

    let host = '';
    if (type !== 'local') {
        const hostPrompt = 'Indique l\'hôte distant : ' + chalk.gray('(ex.: user@remote_host) ');
        if (knownHosts.length > 0) {
            let hostList = 'Hôtes connus : ';
            knownHosts.forEach((knownHost, index) => {
                hostList += `${index}=${knownHost}, `;
                if ((index + 1) % 5 === 0) {
                    hostList += '\n';
                }
            });
            hostList = hostList.trim().replace(/,$/, ''); // Remove the trailing comma
            const hostInput = await askQuestion(`${hostPrompt}\n${hostList}\n`);
            if (!isNaN(hostInput) && hostInput >= 0 && hostInput < knownHosts.length) {
                host = knownHosts[hostInput];
            } else {
                host = hostInput;
            }
        } else {
            host = await askQuestion(hostPrompt);
        }
    }

    let port = '';
    if (type !== 'local') {
        const portInput = await askQuestion('Indiquez le port SSH (laisser vide pour le port par défaut 22): ');
        port = portInput ? `-e 'ssh -p ${portInput}'` : '';
    }

    const localPathQuestion = 'Donnez le chemin sur votre ordinateur ' + chalk.gray(`(dossier en cours '${currentDir}') `) + chalk.yellow('[default=.]: ');
    let localPath = (await askQuestion(localPathQuestion)) || '.';
    localPath = path.resolve(localPath);

    const isLocalPathDirectory = await askQuestion(`Est-ce que ${localPath} est un dossier? (o/n) `);
    localPath = isLocalPathDirectory === 'o' ? `${localPath}/` : localPath;

    let distantComputerPathQuestion = 'Donnez le chemin sur l\'ordinateur distant ' + chalk.gray('(doit être absolut) ') + ': ';
    distantComputerPathQuestion = type === !'local'
        ? distantComputerPathQuestion
        : 'Donnez le chemin sur votre ordinateur du deuxième dossier' + chalk.gray(`(dossier en cours '${currentDir}') `) + chalk.yellow('[default=.]') ;
    let distantPath = await askQuestion(distantComputerPathQuestion);

    if(type === 'local') {
        distantPath = path.resolve(distantPath);
    }

    const isDistantPathDirectory = await askQuestion(`Est-ce que ${distantPath} est un dossier? (o/n) `);
    distantPath = isDistantPathDirectory === 'o' ? `${distantPath}/` : distantPath;

    let excludeFlag;
    do {
        const excludeInput = await askQuestion('Est-ce qu\'il y a des fichiers ou dossiers à exlure ' + chalk.gray('(ex.: .git, .idea, etc.) ') + chalk.gray('(Choix: o,n,y,t,f,oui,non,yes,no,true,false) ') + chalk.yellow('[default=n] '));
        excludeFlag = validateChoice(excludeInput.toLowerCase(), ['o', 'n', 'y', 't', 'f', 'oui', 'non', 'yes', 'no', 'true', 'false'], 'n');
    } while (!excludeFlag);
    let excludeOptions = '';
    if (['o', 'y', 't', 'oui', 'yes', 'true'].includes(excludeFlag)) {
        let excludePath = '';
        do {
            excludePath = await askQuestion('Indique le chemin du fichier ou dossier à exclure. Garder vide pour terminer: ');
            if (excludePath) {
                excludeOptions += `--exclude '${excludePath}' `;
            }
        } while (excludePath);
    }

    let command;
    if (type === 'push') {
        command = `rsync -avhz ${port} ${deleteOption} ${excludeOptions} --progress ${localPath} ${host}:${distantPath}`;
    } else if (type === 'pull') {
        command = `rsync -avhz ${port} ${deleteOption} ${excludeOptions} --progress ${host}:${distantPath} ${localPath}`;
    } else {
        command = `rsync -avh ${deleteOption} ${excludeOptions} --progress ${localPath} ${distantPath}`;
    }

    command = command.replace(/\s+/g, ' ');

    console.log('\nCommande rsync construite:\n');
    console.log(command);

    const dateTime = formatDateTime();

    try {
        let history = [];
        try {
            const data = await fs.readFile(historyFile, 'utf-8');
            history = JSON.parse(data);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        history.push({command, dateTime, host});
        await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Erreur lors de l\'enregistrement de la commande:', error);
    }

    rl.close();
};

const showHistory = async (filter = '') => {
    try {
        const data = await fs.readFile(historyFile, 'utf-8');
        const history = JSON.parse(data);
        const filteredHistory = filter ? history.filter(entry => entry.command.includes(filter)) : history;
        console.log('Historique des commandes rsync:');
        filteredHistory.reverse().forEach((entry, index) => console.log(`${index + 1}: ${entry.dateTime} - ${entry.command}`));
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Aucune commande rsync enregistrée.');
        } else {
            console.error('Erreur lors de la lecture de l\'historique:', error);
        }
    } finally {
        rl.close();
    }
};

const showLastCommand = async () => {
    try {
        const data = await fs.readFile(historyFile, 'utf-8');
        const history = JSON.parse(data);
        const lastEntry = history[history.length - 1];
        console.log(lastEntry.command);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Aucune commande rsync enregistrée.');
        } else {
            console.error('Erreur lors de la lecture de l\'historique:', error);
        }
    } finally {
        rl.close();
    }
};

const main = async () => {
    const arg2 = process.argv[2];
    const arg3 = process.argv[3];

    switch (arg2) {
        case 'h':
        case '--help':
        case 'help':
            console.log('Construction de commandes rsync');
            console.log('Options:');
            console.log('  history [filter] - Affiche l\'historique des commandes rsync. Le filtre est optionnel.');
            console.log('  last - Affiche la dernière commande rsync.');
            break;
        case '--history':
        case 'history':
            await showHistory(arg3);
            break;
        case '--last':
        case 'last':
            await showLastCommand();
            break;
        default:
            await buildRsyncCommand();
    }

    process.exit(0);
};

main();
