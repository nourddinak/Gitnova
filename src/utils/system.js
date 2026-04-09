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
    
    let gitPaths = [];
    let gitBinary = 'git';

    if (process.platform === 'win32') {
      gitPaths = [
        'C:\\Program Files\\Git\\cmd',
        'C:\\Program Files (x86)\\Git\\cmd',
        `${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`
      ];
      gitBinary = 'git.exe';
    } else {
      gitPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        '/bin'
      ];
    }
    
    for (const p of gitPaths) {
      if (fs.existsSync(path.join(p, gitBinary))) {
        console.log(chalk.green(`Found Git at ${p}`));
        if (process.platform === 'win32') {
          const added = await addToPath(p);
          if (added) return true;
        } else {
          console.log(chalk.yellow(`Please add ${p} to your PATH manually.`));
          return true; // We found it, but won't auto-add to PATH on Unix
        }
      }
    }
    return false;
  }
}

export async function installGitDesktop() {
  console.log(chalk.yellow('\nGit was not found anywhere on your system.'));
  
  let installCmd, installArgs, msg;
  if (process.platform === 'win32') {
    installCmd = 'winget';
    installArgs = ['install', '--id', 'Git.Git', '-e', '--source', 'winget'];
    msg = 'Would you like to install Git via winget (PowerShell)?';
  } else if (process.platform === 'darwin') {
    installCmd = 'brew';
    installArgs = ['install', 'git'];
    msg = 'Would you like to install Git via Homebrew?';
  } else {
    installCmd = 'sudo';
    installArgs = ['apt-get', 'install', '-y', 'git'];
    msg = 'Would you like to install Git via apt-get?';
  }

  const answer = await confirm({ message: msg });
  if (answer) {
    console.log(chalk.cyan('Installing Git... Please wait.'));
    try {
      await execa(installCmd, installArgs, { stdio: 'inherit' });
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
    
    let ghPaths = [];
    let ghBinary = 'gh';

    if (process.platform === 'win32') {
      ghPaths = [
        'C:\\Program Files\\GitHub CLI',
        'C:\\Program Files (x86)\\GitHub CLI'
      ];
      ghBinary = 'gh.exe';
    } else {
      ghPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        '/bin'
      ];
    }
    
    for (const p of ghPaths) {
      if (fs.existsSync(path.join(p, ghBinary))) {
        console.log(chalk.green(`Found GitHub CLI at ${p}`));
        if (process.platform === 'win32') {
          const added = await addToPath(p);
          if (added) return true;
        } else {
          console.log(chalk.yellow(`Please add ${p} to your PATH manually.`));
          return true;
        }
      }
    }
    return false;
  }
}

export async function installGh() {
  console.log(chalk.yellow('\nGitHub CLI (gh) was not found on your system.'));
  
  let installCmd, installArgs, msg;
  if (process.platform === 'win32') {
    installCmd = 'winget';
    installArgs = ['install', '--id', 'GitHub.cli', '-e', '--source', 'winget'];
    msg = 'Would you like to install GitHub CLI via winget (PowerShell)?';
  } else if (process.platform === 'darwin') {
    installCmd = 'brew';
    installArgs = ['install', 'gh'];
    msg = 'Would you like to install GitHub CLI via Homebrew?';
  } else {
    installCmd = 'sudo';
    installArgs = ['apt-get', 'install', '-y', 'gh'];
    msg = 'Would you like to install GitHub CLI via apt-get?';
  }

  const answer = await confirm({ message: msg });
  if (answer) {
    console.log(chalk.cyan('Installing GitHub CLI... Please wait.'));
    try {
      await execa(installCmd, installArgs, { stdio: 'inherit' });
      console.log(chalk.green('GitHub CLI installed successfully.'));
      return await checkGhInstalled();
    } catch (e) {
      console.log(chalk.red('Failed to install GitHub CLI. Please install it manually from https://cli.github.com/'));
    }
  } else {
    console.log(chalk.yellow('Skipping GitHub CLI installation. Some GitHub integration features might be limited.'));
  }
}
