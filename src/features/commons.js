import inquirer from "inquirer";

export async function pressEnterToContinue() {
    await inquirer.prompt([{
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...',
    }]);

    console.clear();
}