import { execa } from 'execa';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';

export async function checkGitHubAuth() {
  try {
    await execa('gh', ['auth', 'status']);
    return true;
  } catch (error) {
    return false;
  }
}

export async function loginGitHub() {
  console.log(chalk.yellow('You are not authenticated with GitHub.'));
  const answer = await confirm({ message: 'Would you like to log in to GitHub now?' });
  
  if (answer) {
    console.log(chalk.cyan('Starting GitHub authentication...'));
    try {
      await execa('gh', ['auth', 'login', '-w'], { stdio: 'inherit' });
      console.log(chalk.green('Successfully authenticated with GitHub!'));
    } catch (e) {
      console.log(chalk.red('GitHub authentication failed. Some features may not work.'));
    }
  } else {
    console.log(chalk.yellow('Skipping GitHub login. Ensure your git remotes are accessible.'));
  }
}
