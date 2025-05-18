import {RsyncCommand} from "./src/others/RsyncCommand.js";

try {
    const rsyncCommand = new RsyncCommand();
    await rsyncCommand.askPrompts();

} catch (error) {
    if (error?.message !== 'exit' && error?.name !== 'ExitPromptError') {
        console.error(error);
        process.exit(1);
    }
}

console.log("_".repeat(20));
console.log('Goodbye! 👋');