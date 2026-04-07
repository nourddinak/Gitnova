import { execa } from 'execa';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';

async function addToPath(folderPath) {
  const currentPath = process.env.PATH || '';
  const paths = currentPath.split(path.delimiter).map(p => path.normalize(p).toLowerCase());
  const normFolder = path.normalize(folderPath).toLowerCase();
  
  if (paths.includes(normFolder)) {
    return true; // Already in PATH
  }
  
  const spinner = ora(`Adding ${folderPath} to User PATH...`).start();
  try {
    const pwshCmd = `[Environment]::SetEnvironmentVariable('PATH', [Environment]::GetEnvironmentVariable('PATH', 'User') + ';${folderPath}', 'User')`;
    await execa('powershell', ['-NoProfile', '-Command', pwshCmd]);
    process.env.PATH = `${process.env.PATH};${folderPath}`;
    spinner.succeed(`Added ${folderPath} to PATH.`);
    return true;
  } catch (e) {
    spinner.fail(`Failed to update PATH automatically: ${e.message}`);
    return false;
  }
}

export async function checkGitInstalled() {
  const spinner = ora('Checking for Git...').start();
  try {
    await execa('git', ['--version']);
    spinner.succeed('Git is active.');
    return true;
  } catch (error) {
    spinner.info('Git not found in standard PATH. Scanning common directories...');
    const gitPaths = [
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files (x86)\\Git\\cmd',
      `${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`
    ];
    
    for (const p of gitPaths) {
      if (fs.existsSync(path.join(p, 'git.exe'))) {
        console.log(chalk.green(`Found Git at ${p}`));
        const added = await addToPath(p);
        if (added) return true;
      }
    }
    return false;
  }
}

export async function installGitDesktop() {
  console.log(chalk.yellow('\nGit was not found anywhere on your system.'));
  const answer = await confirm({ message: 'Would you like to install Git via winget (PowerShell)?' });
  if (answer) {
    console.log(chalk.cyan('Installing Git... Please wait.'));
    try {
      await execa('winget', ['install', '--id', 'Git.Git', '-e', '--source', 'winget'], { stdio: 'inherit' });
      console.log(chalk.green('Git installed successfully. Restarting check...'));
      return await checkGitInstalled();
    } catch (e) {
      console.log(chalk.red('Failed to install Git. Please install it manually from https://git-scm.com/'));
      process.exit(1);
    }
  } else {
    console.log(chalk.red('GitNova requires Git to function. Exiting...'));
    process.exit(1);
  }
}

export async function checkGhInstalled() {
  const spinner = ora('Checking for GitHub CLI...').start();
  try {
    await execa('gh', ['--version']);
    spinner.succeed('GitHub CLI is active.');
    return true;
  } catch (error) {
    spinner.info('GitHub CLI not found in standard PATH. Scanning common directories...');
    const ghPaths = [
      'C:\\Program Files\\GitHub CLI',
      'C:\\Program Files (x86)\\GitHub CLI'
    ];
    
    for (const p of ghPaths) {
      if (fs.existsSync(path.join(p, 'gh.exe'))) {
        console.log(chalk.green(`Found GitHub CLI at ${p}`));
        const added = await addToPath(p);
        if (added) return true;
      }
    }
    return false;
  }
}

export async function installGh() {
  console.log(chalk.yellow('\nGitHub CLI (gh) was not found on your system.'));
  const answer = await confirm({ message: 'Would you like to install GitHub CLI via winget (PowerShell)?' });
  if (answer) {
    console.log(chalk.cyan('Installing GitHub CLI... Please wait.'));
    try {
      await execa('winget', ['install', '--id', 'GitHub.cli', '-e', '--source', 'winget'], { stdio: 'inherit' });
      console.log(chalk.green('GitHub CLI installed successfully.'));
      return await checkGhInstalled();
    } catch (e) {
      console.log(chalk.red('Failed to install GitHub CLI. Please install it manually from https://cli.github.com/'));
    }
  } else {
    console.log(chalk.yellow('Skipping GitHub CLI installation. Some GitHub integration features might be limited.'));
  }
}
