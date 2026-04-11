import { confirm as _confirm, editor as _editor, select as _select, input as _input, checkbox as _checkbox } from '@inquirer/prompts';
import { createPrompt, useState, useKeypress, isEnterKey, Separator } from '@inquirer/core';
import readline from 'readline';

function withEsc(promptFn) {
  return async (options) => {
    const escHandler = (chunk, key) => {
      if (key && key.name === 'escape') {
        process.stdin.emit('keypress', '\x03', { sequence: '\x03', name: 'c', ctrl: true, meta: false, shift: false });
      }
    };
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', escHandler);
    try {
      return await promptFn(options);
    } finally {
      process.stdin.removeListener('keypress', escHandler);
    }
  };
}

const select = withEsc(_select);
const input = withEsc(_input);
const confirm = withEsc(_confirm);
const checkbox = withEsc(_checkbox);
const editor = withEsc(_editor);
import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';
import { parseIntent, generateCommitMessage, explainError, setModel, setApiKey, getCurrentModel, auditPushPayload, auditStagingPayload, auditCodebaseForIgnores, summarizeCommandOutput, generateOnboardingSummary, getAutoSettings, setAutoSettings, getProvider, setProvider } from '../utils/ai.js';
import { git, getRepoStatus, getStagedDiff, getDiff, getCurrentBranch, getUnpushedFiles } from '../utils/git.js';
import boxen from 'boxen';
import gradient from 'gradient-string';

const askChatInput = createPrompt((config, done) => {
  const [value, setValue] = useState('');

  useKeypress((key) => {
    if (isEnterKey(key)) {
      done({ type: 'text', value });
    } else if (key.name === 'backspace') {
      setValue(value.slice(0, -1));
    } else if (value.length === 0 && key.sequence === '/') {
      done({ type: 'slash' });
    } else {
      const isArrowKey = ['up', 'down', 'left', 'right', 'pageup', 'pagedown', 'home', 'end'].includes(key.name);
      if (!key.ctrl && !key.meta && !isArrowKey && key.sequence && key.name !== 'return' && key.name !== 'escape') {
        setValue(value + key.sequence);
      }
    }
  });

  const prefix = gradient.pastel('╭─ 🚀 GitNova\n╰─❯');
  return `${prefix} ${value}`;
});

async function executeSecurePush(promptConfirm = true, forcePush = false, isAutoMode = false) {
  const status = await getRepoStatus();
  let currentBranch = status ? status.current : 'main';

  if (status && status.detached) {
    console.log(chalk.red('\n⚠️  You are in a "detached HEAD" state. Git cannot push changes without a branch.'));
    const reattach = await select({
      message: 'How would you like to proceed?',
      choices: [
        { name: '✨ Create a new branch for these changes', value: 'create' },
        { name: '🔗 Force-update an existing branch (e.g., master)', value: 'exists' },
        { name: '⏭  Abort push', value: 'abort' }
      ]
    });

    if (reattach === 'abort') return { success: false, reason: 'USER_ABORT' };

    if (reattach === 'create') {
      const newBranch = await input({ message: 'Enter new branch name:', default: 'feature-branch' });
      await git.checkoutLocalBranch(newBranch);
      currentBranch = newBranch;
      console.log(chalk.green(`Created and switched to branch '${currentBranch}'.`));
    } else {
      const targetBranch = await input({ message: 'Enter branch name to force-update:', default: 'master' });
      await git.branch(['-f', targetBranch, 'HEAD']);
      await git.checkout(targetBranch);
      currentBranch = targetBranch;
      forcePush = true; // Use force push when manual reattaching
      console.log(chalk.green(`Reattached to '${currentBranch}' at current commit.`));
    }
  }

  if (promptConfirm) {
    const pushConfirm = await confirm({ message: chalk.yellow(`Push to origin/${currentBranch}?`), default: true });

    if (!pushConfirm) {
      console.log(chalk.yellow('Push aborted.'));
      return { success: false, reason: 'USER_ABORT' };
    }
  }

  const unpushedFiles = await getUnpushedFiles();
  if (!isAutoMode && unpushedFiles.length > 0) {
    const scanSpinner = ora('Scanning commit payload for security risks...').start();
    const flaggedFiles = await auditPushPayload(unpushedFiles);
    scanSpinner.stop();

    if (flaggedFiles && flaggedFiles.length > 0) {
      console.log(chalk.red('\n⚠️  SECURITY WARNING: The AI flagged the following files as potential risks:'));
      flaggedFiles.forEach(f => console.log(chalk.yellow(` - ${f.file}: `) + chalk.gray(f.reason)));

      const safeguardConfirm = await confirm({ message: 'Do you want to safely add these to .gitignore and scrub them from the commit before pushing?', default: true });
      if (safeguardConfirm) {
        const choices = flaggedFiles.map(f => ({ name: f.file, value: f.file, checked: true }));
        const filesToIgnore = await checkbox({
          message: 'Select files you want to SAFE GUARD (unchecked files will be pushed):',
          choices: choices
        });

        if (filesToIgnore.length > 0) {
          const gitignorePath = path.join(process.cwd(), '.gitignore');
          const payload = `\n# AI Safeguarded Files\n${filesToIgnore.join('\n')}\n`;
          if (fs.existsSync(gitignorePath)) {
            fs.appendFileSync(gitignorePath, payload);
          } else {
            fs.writeFileSync(gitignorePath, payload);
          }

          let scrubbed = false;
          for (const file of filesToIgnore) {
            try {
              await git.rm(['--cached', file]);
              scrubbed = true;
            } catch (e) { }
          }
          if (scrubbed) {
            await git.commit(['--amend', '--no-edit']);
            console.log(chalk.green(`Safeguarded ${filesToIgnore.length} files and scrubbed commit history.`));
          }
        }
      }
    }
  }

  const pushSpinner = ora(forcePush ? 'Force pushing changes...' : 'Pushing changes...').start();
  const branch = await getCurrentBranch() || 'main';
  try {
    const pushArgs = ['-u', 'origin', branch];
    if (forcePush) pushArgs.push('--force');
    await git.push(pushArgs);
    pushSpinner.succeed(chalk.green(forcePush ? 'Force push successful.' : 'Push successful.'));
    return { success: true };
  } catch (e) {
    pushSpinner.fail(chalk.red('Push failed.'));
    const errMsg = e.message || '';

    // Check for "remote rejected because it has newer commits"
    if (errMsg.includes('fetch first') || errMsg.includes('Updates were rejected') || errMsg.includes('non-fast-forward')) {
      console.log(chalk.yellow('\n⚠️  The remote repository has changes your local branch does not have.'));
      return { success: false, reason: 'PUSH_REJECTED_NEW_COMMITS', error: errMsg };
    }

    // Auto-heal: remote not found (deleted, wrong name, typo) OR missing remote entirely
    if (errMsg.includes('No configured push destination') || errMsg.includes('does not appear to be a git repository') || errMsg.includes('No such remote') || errMsg.includes('Repository not found') || errMsg.includes('not found') || errMsg.includes('404')) {
      const isDeleted = errMsg.includes('Repository not found') || errMsg.includes('not found') || errMsg.includes('404');
      if (isDeleted && !errMsg.includes('No such remote')) {
        console.log(chalk.red('\n⚠️  The remote repository on GitHub was not found. It may have been deleted, renamed, or you lost access.'));
      } else {
        console.log(chalk.yellow('\n⚠️  It looks like this local repository is not linked to GitHub (missing "origin" remote).'));
      }
      const setupChoice = await select({
        message: 'How do you want to set up GitHub for this project?',
        choices: [
          { name: '🔗 Connect to an existing GitHub repository', value: 'existing' },
          { name: '✨ Create a brand new private GitHub repository', value: 'create' },
          { name: '⏭  Skip for now', value: 'skip' }
        ]
      });

      if (setupChoice === 'existing') {
        let linked = false;
        while (!linked) {
          const repoInput = await input({ message: 'Enter the repo name (or Username/Repo or full URL):' });
          if (!repoInput.trim()) { console.log(chalk.yellow('Skipped.')); return { success: false, reason: 'NO_REMOTE' }; }
          let finalUrl = repoInput.trim();
          if (!finalUrl.startsWith('http') && !finalUrl.startsWith('git@')) {
            if (!finalUrl.includes('/')) {
              try {
                const { stdout } = await execa('gh', ['api', '/user', '--jq', '.login']);
                finalUrl = `https://github.com/${stdout.trim()}/${finalUrl}.git`;
                console.log(chalk.gray(`Resolved to: ${finalUrl}`));
              } catch (err) {
                console.log(chalk.yellow('Could not auto-resolve username. Use Username/Repo format.'));
                continue;
              }
            } else {
              finalUrl = `https://github.com/${finalUrl}.git`;
            }
          }
          const spinner = ora('Linking and verifying repo...').start();
          try {
            try { await git.remote(['remove', 'origin']); } catch (e) { }
            await git.remote(['add', 'origin', finalUrl]);
            await execa('git', ['ls-remote', '--exit-code', finalUrl]);
            spinner.succeed(chalk.green('Remote linked and verified!'));
            linked = true;
            const b = await getCurrentBranch() || 'main';
            const doPush = await confirm({ message: chalk.yellow(`You are on branch '${b}'. Push to origin/${b}?`), default: true });
            if (doPush) {
              const ps2 = ora(forcePush ? 'Force pushing...' : 'Pushing...').start();
              try {
                const pushArgs = ['-u', 'origin', b];
                if (forcePush) pushArgs.push('--force');
                await git.push(pushArgs);
                ps2.succeed(chalk.green(forcePush ? 'Force pushed successfully!' : 'Pushed successfully!'));
                return { success: true };
              } catch (e2) {
                ps2.fail(chalk.red('Push failed: ' + e2.message));
                const errMsg2 = e2.message || '';
                if (errMsg2.includes('fetch first') || errMsg2.includes('Updates were rejected') || errMsg2.includes('non-fast-forward')) {
                  return { success: false, reason: 'PUSH_REJECTED_NEW_COMMITS', error: errMsg2 };
                }
                return { success: false, reason: 'PUSH_ERROR', error: errMsg2 };
              }
            } else {
              console.log(chalk.yellow('Remote configured. Push skipped.'));
              return { success: true };
            }
          } catch (err) {
            spinner.fail(chalk.red(`Could not connect to '${finalUrl}'.`));
            console.log(chalk.red('This may mean: wrong repo name, typo, or a private repo you cannot access.'));
            const retry = await confirm({ message: 'Try a different repo name?', default: true });
            if (!retry) { try { await git.remote(['remove', 'origin']); } catch (e) { }; return { success: false, reason: 'USER_ABORT' }; }
          }
        }
      } else if (setupChoice === 'create') {
        const defaultName = path.basename(process.cwd());
        const newRepoName = await input({ message: 'Enter new repository name:', default: defaultName });
        const spinner = ora('Creating new GitHub repository and pushing...').start();
        try {
          try { await git.remote(['remove', 'origin']); } catch (e) { }
          await execa('gh', ['repo', 'create', newRepoName, '--private', '--source=.', '--remote=origin']);
          const branch = await getCurrentBranch() || 'main';
          spinner.text = 'Pushing...';
          await git.push(['-u', 'origin', branch]);
          spinner.succeed(chalk.green(`Created private repo '${newRepoName}' on GitHub and pushed your code!`));
          return { success: true };
        } catch (err) {
          spinner.fail(chalk.red('Failed to create repo: ' + (err.stderr || err.message)));
          console.log(chalk.yellow('Ensure the GitHub CLI (gh) is authenticated via "gh auth login".'));
          return { success: false, reason: 'PUSH_ERROR', error: err.message };
        }
      } else {
        console.log(chalk.yellow('Skipped GitHub setup.'));
        return { success: false, reason: 'NO_REMOTE' };
      }
    } else {
      console.log(chalk.red(errMsg));
      return { success: false, reason: 'PUSH_ERROR', error: errMsg };
    }
  }
}

async function checkDangerousStaging() {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  let currentIgnore = '';
  if (fs.existsSync(gitignorePath)) currentIgnore = fs.readFileSync(gitignorePath, 'utf8');

  let rootItems = [];
  try {
    rootItems = fs.readdirSync(process.cwd()).map(item => {
      try {
        if (fs.statSync(path.join(process.cwd(), item)).isDirectory()) return item + '/';
      } catch (e) { }
      return item;
    }).filter(i => i !== '.git/');
  } catch (e) { return true; }

  if (rootItems.length === 0) return true;

  const scanSpinner = ora('AI scanning project structure for dangerous files...').start();
  const flaggedFiles = await auditStagingPayload(rootItems, currentIgnore);
  scanSpinner.stop();

  if (flaggedFiles && flaggedFiles.length > 0) {
    console.log(chalk.red(`\n⚠️  WARNING: The AI flagged ${flaggedFiles.length} highly risky file(s) about to be staged:`));
    flaggedFiles.forEach(f => console.log(chalk.yellow(` - ${f.file}: `) + chalk.gray(f.reason)));

    const safeguardConfirm = await confirm({ message: 'Do you want to safely ignore them by adding them to .gitignore before staging?', default: true });
    if (safeguardConfirm) {
      const choices = flaggedFiles.map(f => ({ name: f.file, value: f.file, checked: true }));
      const filesToIgnore = await checkbox({
        message: 'Select files you want to SAFE GUARD (will be permanently ignored):',
        choices: choices
      });
      if (filesToIgnore.length > 0) {
        let suffixUnignored = filesToIgnore.map(i => {
          try {
            if (fs.statSync(path.join(process.cwd(), i.replace(/\/$/, ''))).isDirectory()) {
              if (!i.endsWith('/')) return i + '/';
            }
          } catch (e) { }
          return i;
        });
        const payload = `\n# AI Auto-Safeguard (Staging)\n${suffixUnignored.join('\n')}\n`;
        if (fs.existsSync(gitignorePath)) fs.appendFileSync(gitignorePath, payload);
        else fs.writeFileSync(gitignorePath, payload);
        console.log(chalk.green(`Added ${filesToIgnore.length} items to .gitignore.`));
      }
    } else {
      const proceed = await confirm({ message: chalk.red('Proceed with staging these dangerous files anyway?'), default: false });
      if (!proceed) return false;
    }
  }
  return true;
}

export async function autoCommitAndPush(customMessage) {
  try {
  console.log(chalk.cyan('🚀 Starting GitNova in Auto Mode...'));

  const statusObj = await getRepoStatus();
  if (!statusObj) {
    console.log(chalk.red('Not a Git repository. Exiting...'));
    process.exit(1);
  }

  if (statusObj.files.length === 0) {
    console.log(chalk.green('✔ Working directory clean. Nothing to commit or push.'));
    process.exit(0);
  }

  const autoIgnoreSetting = getAutoSettings();
  let dangerousFilesWarn = [];

  const gitignorePath = path.join(process.cwd(), '.gitignore');
  let currentIgnore = '';
  if (fs.existsSync(gitignorePath)) currentIgnore = fs.readFileSync(gitignorePath, 'utf8');

  let rootItems = [];
  try {
    rootItems = fs.readdirSync(process.cwd()).map(item => {
      try {
        if (fs.statSync(path.join(process.cwd(), item)).isDirectory()) return item + '/';
      } catch (e) { }
      return item;
    }).filter(i => i !== '.git/');
  } catch (e) { }

  if (rootItems.length > 0) {
    const scanSpinner = ora('AI scanning project for dangerous files...').start();
    const flaggedFiles = await auditStagingPayload(rootItems, currentIgnore);
    scanSpinner.stop();

    if (flaggedFiles && flaggedFiles.length > 0) {
      if (autoIgnoreSetting === 'ask_me') {
        console.log(chalk.red(`\n⚠️  WARNING: The AI flagged ${flaggedFiles.length} highly risky file(s) about to be staged:`));
        flaggedFiles.forEach(f => console.log(chalk.yellow(` - ${f.file}: `) + chalk.gray(f.reason)));

        const safeguardConfirm = await confirm({ message: 'Do you want to safely ignore them by adding them to .gitignore before pushing?', default: true });
        if (safeguardConfirm) {
          const choices = flaggedFiles.map(f => ({ name: f.file, value: f.file, checked: true }));
          const filesToIgnore = await checkbox({
            message: 'Select files you want to SAFE GUARD (will be permanently ignored):',
            choices: choices
          });
          if (filesToIgnore.length > 0) {
            let suffixUnignored = filesToIgnore.map(i => {
              try {
                if (fs.statSync(path.join(process.cwd(), i.replace(/\/$/, ''))).isDirectory()) {
                  if (!i.endsWith('/')) return i + '/';
                }
              } catch (e) { }
              return i;
            });
            const payload = `\n# AI Auto-Safeguard (Auto Mode)\n${suffixUnignored.join('\n')}\n`;
            if (fs.existsSync(gitignorePath)) fs.appendFileSync(gitignorePath, payload);
            else fs.writeFileSync(gitignorePath, payload);
            console.log(chalk.green(`✔ Auto-ignored ${filesToIgnore.length} dangerous files.`));
          }
        } else {
          console.log(chalk.yellow('Skipping ignore. Staging and pushing anyway...'));
        }
        console.log(chalk.gray('(Tip: You can change this default pausing behavior using /settings in normal mode)\n'));
      } else if (autoIgnoreSetting === 'auto_ignore') {
        const filesToIgnore = flaggedFiles.map(f => f.file);
        let suffixUnignored = filesToIgnore.map(i => {
          try {
            if (fs.statSync(path.join(process.cwd(), i.replace(/\/$/, ''))).isDirectory()) {
              if (!i.endsWith('/')) return i + '/';
            }
          } catch (e) { }
          return i;
        });
        const payload = `\n# AI Auto-Safeguard (Auto Mode)\n${suffixUnignored.join('\n')}\n`;
        if (fs.existsSync(gitignorePath)) fs.appendFileSync(gitignorePath, payload);
        else fs.writeFileSync(gitignorePath, payload);
        console.log(chalk.green(`✔ Auto-ignored ${filesToIgnore.length} dangerous files based on your settings.`));
      } else if (autoIgnoreSetting === 'notify') {
        dangerousFilesWarn = flaggedFiles;
      }
    }
  }

  // Add all
  const addSpinner = ora('Staging all changes...').start();
  await git.add('.');
  addSpinner.succeed(chalk.green('Staged all changes.'));

  let commitMsg = customMessage;

  // Generate Message if customMessage not provided
  if (!commitMsg) {
    const diffSpinner = ora('AI generating commit message...').start();
    const diff = await getStagedDiff();
    const aiMessage = await generateCommitMessage(diff);
    diffSpinner.stop();
    commitMsg = aiMessage || 'Auto-commit by GitNova';
  }

  // Commit
  const commitSpinner = ora('Committing...').start();
  try {
    const res = await git.commit(commitMsg);
    commitSpinner.succeed(chalk.green(`Committed [${res.commit}] ${commitMsg}`));
  } catch (e) {
    commitSpinner.fail(chalk.red('Commit failed.'));
    console.error(e.message);
    process.exit(1);
  }

  // Push
  const pushRes = await executeSecurePush(false, false, true);
  if (pushRes && pushRes.success) {
    if (dangerousFilesWarn.length > 0) {
      console.log(chalk.red(`\n⚠️  WARNING: The AI noticed you auto-pushed ${dangerousFilesWarn.length} highly risky file(s):`));
      dangerousFilesWarn.forEach(f => console.log(chalk.yellow(` - ${f.file}: `) + chalk.gray(f.reason)));
      console.log(chalk.yellow('Consider using the "/settings" menu in normal mode to set GitNova to automatically ignore these in the future!'));
    }
    process.exit(0);
  } else {
    console.log(chalk.red('\nAuto-push sequence failed or was aborted. Please check your GitHub remote configuration.'));
    process.exit(1);
  }
  } catch (err) {
    if (err && (err.name === 'ExitPromptError' || (err.message && err.message.includes('force closed')))) {
      console.log(chalk.cyan('\nGoodbye!'));
      process.exit(0);
    }
    console.error(chalk.red('\nAuto Mode Error:'), err.message);
    process.exit(1);
  }
}

export async function startChatSession() {
  const welcomeMsg =
    chalk.cyan('GitNova AI Assistant initialized.\n') +
    chalk.gray('Developed by nourddinak\n\n') +
    chalk.cyan('Type "exit" or "quit" to leave.\n') +
    chalk.cyan('Type "/" to access settings, models, and options.\n\n') +
    chalk.cyan('🚀 Auto Mode:\n') +
    chalk.gray('  Run "gitnova -auto" to auto-commit instantly.\n') +
    chalk.gray('  Run "gitnova -auto \'message\'" to use a custom message.\n\n') +
    chalk.cyan('💬 Chat:\n') +
    chalk.gray('  Example: "commit my changes", "push to main", "status"');
  console.log(boxen(welcomeMsg, { padding: 1, margin: 1, borderStyle: 'double', borderColor: 'cyan', title: 'Welcome', titleAlignment: 'center' }));

  let autoPromptError = null;
  let chatHistory = [];

  while (true) {
    let userInput;
    let inputResult;

    if (autoPromptError) {
        userInput = autoPromptError;
        autoPromptError = null;
        console.log(chalk.red('\n🤖 [Auto-Healing] Sending error back to AI for analysis...'));
      } else {
        inputResult = await askChatInput().catch((err) => {
          if (err && (err.name === 'ExitPromptError' || (err.message && err.message.includes('force closed')))) {
            console.log(chalk.cyan('\nGoodbye!'));
            process.exit(0);
          }
          throw err;
        });

        if (inputResult.type === 'slash') {
          await new Promise(r => setTimeout(r, 50)); // Allow inquirer to completely release stdin lock
          let slashMenuOpen = true;
          while (slashMenuOpen) {
            try {
              const cmd = await select({
                message: 'Select a command:',
                choices: [
                  new Separator(chalk.cyan.bold('\n  --- General Tools ---  ')),
                  { name: '    ↩️  Back to Chat', value: 'cancel' },
                  { name: '    ℹ️  Repo Info (/info)', value: '/info' },
                  { name: '    📊 Repo Stats (/stats)', value: '/stats' },
                  { name: '    🐛 Report a Bug (/bugs)', value: '/bugs' },
                  { name: '    🔒 Privacy Info (/privacy)', value: '/privacy' },
                  { name: '    🧹 Clear Terminal (/clear)', value: '/clear' },
                  { name: '    ❓ Help (/help)', value: '/help' },
                  new Separator(chalk.cyan.bold('\n  --- Configuration ---  ')),
                  { name: '    ⚙️  Auto Mode Settings (/settings)', value: '/settings' },
                  { name: '    🗂️  View Current Config (/config)', value: '/config' },
                  { name: '    🤖 Change AI Provider (/provider)', value: '/provider' },
                  { name: '    🧠 Change AI Model (/model)', value: '/model' },
                  { name: '    🔑 Change API Key (/key)', value: '/key' },
                  { name: '    🚫 Manage Git Ignore (/ignore)', value: '/ignore' },
                  { name: '    🌿 Rename Branch (/rename-branch)', value: '/rename-branch' },
                  new Separator(chalk.cyan.bold('\n  --- AI Workflows ---  ')),
                  { name: '    🚀 Repo Onboarding (/onboard)', value: '/onboard' },
                ]
              });

              if (cmd === 'cancel') {
                slashMenuOpen = false;
                break;
              }

              if (cmd === '/info') {
                const infoSpinner = ora('Gathering repository information...').start();
                try {
                  const status = await getRepoStatus();
                  const branch = status ? status.current : 'Unknown';

                  let commitCount = '0';
                  try { commitCount = (await execa('git', ['rev-list', '--count', 'HEAD'])).stdout.trim(); } catch (e) { }

                  let remoteUrl = 'No remote linked';
                  try { remoteUrl = (await execa('git', ['config', '--get', 'remote.origin.url'])).stdout.trim(); } catch (e) { }

                  let ghInfo = '';
                  if (remoteUrl !== 'No remote linked') {
                    try {
                      const { stdout } = await execa('gh', ['repo', 'view', '--json', 'name,isPrivate,description,stargazerCount']);
                      const ghData = JSON.parse(stdout);
                      ghInfo = `\n${chalk.bold('GitHub Repo:')} ${ghData.name}\n${chalk.bold('Visibility:')} ${ghData.isPrivate ? chalk.red('🔒 Private') : chalk.green('🌍 Public')}\n${chalk.bold('Stars:')} ⭐ ${ghData.stargazerCount}\n${chalk.bold('Description:')} ${ghData.description || 'None'}`;
                    } catch (e) { }
                  }

                  infoSpinner.stop();

                  const infoText = `${chalk.cyan.bold('Repository Status:')}\n` +
                    `${chalk.bold('Current Branch:')} ${branch}\n` +
                    `${chalk.bold('Total Commits:')} ${commitCount}\n` +
                    `${chalk.bold('Pending Changes:')} ${status ? status.modified.length + status.staged.length : 0} files\n` +
                    `${chalk.bold('Remote URL:')} ${remoteUrl}` +
                    ghInfo;

                  console.log(boxen(infoText, { padding: 1, margin: { top: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'green', title: 'ℹ️ Repo Info' }));
                } catch (err) {
                  infoSpinner.fail(chalk.red('Failed to gather repo info.'));
                }
              } else if (cmd === '/ignore') {
                const defaultIgnores = `# Common Exclusions\nnode_modules/\n.env\ndist/\nbuild/\n*.log\n.DS_Store\nThumbs.db\n`;
                const gitignorePath = path.join(process.cwd(), '.gitignore');

                const ignoreAction = await select({
                  message: 'Manage .gitignore:',
                  choices: [
                    { name: '✨ AI Codebase Scan (Find missing ignores)', value: 'ai_scan' },
                    { name: 'View current .gitignore', value: 'view' },
                    { name: 'Add standard defaults (node_modules, .env, etc.)', value: 'defaults' },
                    { name: 'Add custom pattern', value: 'custom' },
                    { name: 'Go Back', value: 'cancel' }
                  ]
                });

                if (ignoreAction === 'cancel') continue;

                if (ignoreAction === 'ai_scan') {
                  const scanSpinner = ora('AI mapping physical directory structure...').start();
                  const rootItems = fs.readdirSync(process.cwd()).map(item => {
                    try {
                      if (fs.statSync(path.join(process.cwd(), item)).isDirectory()) return item + '/';
                    } catch (e) { }
                    return item;
                  });
                  // Exclude `.git` so we don't send it to the AI
                  const cleanedItems = rootItems.filter(i => i !== '.git/');

                  let currentIgnore = '';
                  if (fs.existsSync(gitignorePath)) currentIgnore = fs.readFileSync(gitignorePath, 'utf8');

                  scanSpinner.text = 'AI cross-referencing files with .gitignore rules...';
                  const flagged = await auditCodebaseForIgnores(cleanedItems, currentIgnore);
                  scanSpinner.stop();

                  if (flagged && flagged.length > 0) {
                    console.log(chalk.red('\n⚠️  SECURITY & BLOAT WARNING: The AI found highly risky files/folders physically present that are NOT ignored!'));
                    flagged.forEach(f => console.log(chalk.yellow(` - ${f.file}: `) + chalk.gray(f.reason)));

                    const safeguardConfirm = await confirm({ message: 'Do you want the AI to fix your .gitignore and proactively scrub them from Git history?', default: true });
                    if (safeguardConfirm) {
                      const choices = flagged.map(f => ({ name: f.file, value: f.file, checked: true }));
                      const filesToIgnore = await checkbox({
                        message: 'Select files you want to SAFE GUARD (will be permanently ignored & scrubbed):',
                        choices: choices
                      });
                      if (filesToIgnore.length > 0) {
                        const payload = `\n# AI Auto-Safeguard (Codebase Scan)\n${filesToIgnore.join('\n')}\n`;
                        if (fs.existsSync(gitignorePath)) fs.appendFileSync(gitignorePath, payload);
                        else fs.writeFileSync(gitignorePath, payload);

                        let scrubbed = false;
                        for (const file of filesToIgnore) {
                          try {
                            await git.rm(['-r', '--cached', file]);
                            scrubbed = true;
                          } catch (e) { }
                        }
                        if (scrubbed) {
                          try {
                            await git.commit(['-m', 'chore: AI proactively safeguarded sensitive files and scrubbed history']);
                          } catch (e) { }
                        }
                        console.log(chalk.green(`\n✔ Added ${filesToIgnore.length} items to .gitignore and scrubbed history!`));
                      }
                    }
                  } else {
                    console.log(chalk.green('\n✔ The AI verified that your .gitignore securely covers all your current files. Zero risks found!'));
                  }
                } else if (ignoreAction === 'view') {
                  if (fs.existsSync(gitignorePath)) {
                    console.log(chalk.cyan('\nCurrent .gitignore contents:'));
                    console.log(chalk.gray(fs.readFileSync(gitignorePath, 'utf8')));
                  } else {
                    console.log(chalk.yellow('No .gitignore file exists yet.'));
                  }
                } else if (ignoreAction === 'defaults') {
                  const defaultList = [
                    'node_modules/',
                    'dist/',
                    'build/',
                    '.env',
                    '.env.local',
                    '.env.development.local',
                    '.env.test.local',
                    '.env.production.local',
                    '*.log',
                    'npm-debug.log*',
                    'yarn-debug.log*',
                    'yarn-error.log*',
                    'coverage/',
                    '.nyc_output/',
                    '.DS_Store',
                    'Thumbs.db',
                    '*.sqlite',
                    '*.db',
                    '.vscode/',
                    '.idea/'
                  ];

                  if (fs.existsSync(gitignorePath)) {
                    const current = fs.readFileSync(gitignorePath, 'utf8');
                    const missing = defaultList.filter(item => !current.includes(item));

                    if (missing.length === 0) {
                      console.log(chalk.yellow('It looks like all standard defaults are already present.'));
                    } else {
                      fs.appendFileSync(gitignorePath, `\n# GitNova Default Exclusions\n${missing.join('\n')}\n`);
                      console.log(chalk.green('Missing standard defaults appended to .gitignore.'));
                    }
                  } else {
                    fs.writeFileSync(gitignorePath, `# GitNova Common Exclusions\n${defaultList.join('\n')}\n`);
                    console.log(chalk.green('Created .gitignore with standard defaults.'));
                  }
                } else if (ignoreAction === 'custom') {
                  const pattern = await input({ message: 'Enter pattern(s) or drag-and-drop items from Windows Explorer:' });
                  if (pattern) {
                    const tokens = [];
                    const regex = /[^ \t\r\n"']+|"([^"]*)"|'([^']*)'/g;
                    let match;
                    while ((match = regex.exec(pattern)) !== null) {
                      tokens.push(match[1] || match[2] || match[0]);
                    }

                    const verifiedPatterns = [];
                    for (let token of tokens) {
                      if (path.isAbsolute(token)) {
                        const rel = path.relative(process.cwd(), token);
                        if (rel.startsWith('..') && !rel.startsWith('...')) {
                          console.log(chalk.yellow(`Skipped ${token} (Path is outside current repository bounds)`));
                          continue;
                        }

                        let gitPath = rel.replace(/\\\\/g, '/');

                        try {
                          const stat = fs.statSync(token);
                          if (stat.isDirectory()) {
                            gitPath += '/';
                          }
                        } catch (e) {
                        }
                        verifiedPatterns.push(gitPath);
                      } else {
                        verifiedPatterns.push(token);
                      }
                    }

                    if (verifiedPatterns.length > 0) {
                      const payload = `\n# Custom Exclusions\n${verifiedPatterns.join('\\n')}\n`;
                      if (fs.existsSync(gitignorePath)) {
                        fs.appendFileSync(gitignorePath, payload);
                      } else {
                        fs.writeFileSync(gitignorePath, payload);
                      }
                      console.log(chalk.green(`Added ${verifiedPatterns.length} item(s) to .gitignore.`));
                    }
                  }
                }
              } else if (cmd === '/onboard') {
                const scanSpinner = ora('Scanning repository structure...').start();
                let rootItems = [];
                try {
                  rootItems = fs.readdirSync(process.cwd()).map(item => {
                    try {
                      if (fs.statSync(path.join(process.cwd(), item)).isDirectory()) return item + '/';
                    } catch (e) { }
                    return item;
                  }).filter(i => i !== '.git/' && i !== 'node_modules/');
                } catch (e) { }

                let pkgContent = 'No package.json found.';
                const pkgPath = path.join(process.cwd(), 'package.json');
                if (fs.existsSync(pkgPath)) {
                  pkgContent = fs.readFileSync(pkgPath, 'utf8');
                }

                scanSpinner.text = 'AI analyzing architecture...';
                const summary = await generateOnboardingSummary(rootItems, pkgContent);
                scanSpinner.stop();
                console.log(chalk.cyan('\n🚀 Repository Onboarding Summary:\n'));
                console.log(summary + '\n');
              } else if (cmd === '/stats') {
                const statsSpinner = ora('Gathering repository statistics...').start();
                try {
                  // Commits per author
                  let authorStats = '';
                  try {
                    const { stdout: shortlog } = await execa('git', ['shortlog', '-sn', '--no-merges', 'HEAD']);
                    authorStats = shortlog.trim();
                  } catch (e) { authorStats = 'No commits yet.'; }

                  // Total lines added / deleted across all commits
                  let linesAdded = 0;
                  let linesDeleted = 0;
                  try {
                    const { stdout: numstat } = await execa('git', ['log', '--pretty=tformat:', '--shortstat']);
                    for (const line of numstat.split('\n')) {
                      const addM = line.match(/(\d+) insertion/);
                      const delM = line.match(/(\d+) deletion/);
                      if (addM) linesAdded += parseInt(addM[1], 10);
                      if (delM) linesDeleted += parseInt(delM[1], 10);
                    }
                  } catch (e) {}

                  // Total commits
                  let totalCommits = '0';
                  try { totalCommits = (await execa('git', ['rev-list', '--count', 'HEAD'])).stdout.trim(); } catch (e) {}

                  statsSpinner.stop();

                  const statsText =
                    chalk.cyan.bold('📊 Repository Statistics\n') +
                    `${chalk.bold('Total Commits:')}  ${totalCommits}\n` +
                    `${chalk.bold('Lines Added:')}    ${chalk.green('+' + linesAdded)}\n` +
                    `${chalk.bold('Lines Removed:')}  ${chalk.red('-' + linesDeleted)}\n\n` +
                    chalk.bold('Commits per Author:\n') +
                    chalk.gray(authorStats || 'No data');

                  console.log(boxen(statsText, { padding: 1, margin: { top: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'cyan', title: '📊 Stats' }));
                } catch (err) {
                  statsSpinner.fail(chalk.red('Failed to gather stats: ' + err.message));
                }
              } else if (cmd === '/config') {
                const configPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.gitnova-config.json');
                try {
                  let configData = {};
                  if (fs.existsSync(configPath)) {
                    configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                  }

                  // Fetch live auth info
                  let ghLogin = '(not logged in)';
                  let gitUserName = '';
                  let gitUserEmail = '';
                  try {
                    const { stdout: u } = await execa('gh', ['api', 'user', '--jq', '.login'], { reject: false });
                    if (u && u.trim()) ghLogin = `@${u.trim()}`;
                  } catch (e) {}
                  try {
                    const { stdout: n } = await execa('git', ['config', 'user.name'], { reject: false });
                    const { stdout: em } = await execa('git', ['config', 'user.email'], { reject: false });
                    gitUserName = n ? n.trim() : '';
                    gitUserEmail = em ? em.trim() : '';
                  } catch (e) {}

                  const display = {
                    provider: configData.provider || 'gemini (default)',
                    model:    configData.model    || 'gemini-2.5-flash (default)',
                    autoIgnoreBehavior: configData.autoIgnoreBehavior || 'ask_me (default)',
                    geminiApiKey:   configData.geminiApiKey   ? '***' + configData.geminiApiKey.slice(-4)   : '(not set)',
                    deepseekApiKey: configData.deepseekApiKey ? '***' + configData.deepseekApiKey.slice(-4) : '(not set)',
                    groqApiKey:     configData.groqApiKey     ? '***' + configData.groqApiKey.slice(-4)     : '(not set)',
                    claudeApiKey:   configData.claudeApiKey   ? '***' + configData.claudeApiKey.slice(-4)   : '(not set)',
                  };

                  const configText =
                    chalk.cyan.bold('🗂️  GitNova Config\n') +
                    chalk.bold('── Accounts ──────────────────\n') +
                    `${chalk.bold('GitHub Account:')}     ${chalk.green(ghLogin)}\n` +
                    `${chalk.bold('Git User:')}           ${gitUserName ? chalk.white(`${gitUserName}${gitUserEmail ? ` <${gitUserEmail}>` : ''}`) : chalk.gray('(not set)')}\n` +
                    chalk.bold('\n── AI Settings ───────────────\n') +
                    `${chalk.bold('Provider:')}           ${display.provider}\n` +
                    `${chalk.bold('Model:')}              ${display.model}\n` +
                    `${chalk.bold('Auto Mode:')}          ${display.autoIgnoreBehavior}\n` +
                    chalk.bold('\n── API Keys ──────────────────\n') +
                    `${chalk.bold('Gemini Key:')}         ${chalk.gray(display.geminiApiKey)}\n` +
                    `${chalk.bold('DeepSeek Key:')}       ${chalk.gray(display.deepseekApiKey)}\n` +
                    `${chalk.bold('Groq Key:')}           ${chalk.gray(display.groqApiKey)}\n` +
                    `${chalk.bold('Claude Key:')}         ${chalk.gray(display.claudeApiKey)}\n` +
                    chalk.gray(`\nConfig file: ${configPath}`);

                  console.log(boxen(configText, { padding: 1, margin: { top: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'blue', title: '🗂️ Config' }));
                } catch (err) {
                  console.log(chalk.red('Failed to read config: ' + err.message));
                }
              } else if (cmd === '/settings') {
                const currentBehavior = getAutoSettings();
                const settingsChoices = [
                  { label: 'Ask me whether to ignore them (Default)', value: 'ask_me' },
                  { label: 'Warn me after pushing them', value: 'notify' },
                  { label: 'Automatically add them to .gitignore before pushing', value: 'auto_ignore' },
                  { label: 'Do nothing (Push anyway)', value: 'push_anyway' }
                ].map(c => ({ name: c.value === currentBehavior ? chalk.green(`✔ ${c.label}`) : `  ${c.label}`, value: c.value }));
                const behavior = await select({
                  message: 'When running in --auto mode and dangerous files are detected:',
                  choices: settingsChoices,
                  default: currentBehavior
                });
                setAutoSettings(behavior);
                console.log(chalk.green(`✔ Auto mode setting saved: ${behavior}`));
              } else if (cmd === '/key') {
                await setApiKey();
              } else if (cmd === '/provider') {
                const currentProvider = getProvider();
                const providerChoices = [
                  { label: 'Google Gemini', value: 'gemini' },
                  { label: 'DeepSeek (Native)', value: 'deepseek' },
                  { label: 'Groq (Fast Inference)', value: 'groq' },
                  { label: 'Anthropic Claude', value: 'claude' }
                ].map(c => ({ name: c.value === currentProvider ? chalk.green(`✔ ${c.label}`) : `  ${c.label}`, value: c.value }));
                const newProvider = await select({
                  message: 'Select AI Provider:',
                  choices: providerChoices,
                  default: currentProvider
                });
                if (newProvider !== currentProvider) {
                  setProvider(newProvider);
                  console.log(chalk.green(`Provider changed to ${newProvider}. Your model was reset to the default.`));
                  await setApiKey();
                } else {
                  console.log(chalk.yellow('Provider unchanged.'));
                }
              } else if (cmd === '/model') {
                let models = [];
                const provider = getProvider();
                if (provider === 'deepseek') {
                  models = [
                    'deepseek-chat',
                    'deepseek-reasoner'
                  ];
                } else if (provider === 'groq') {
                  models = [
                    'llama-3.3-70b-versatile',
                    'llama-3.1-8b-instant',
                    'llama3-70b-8192',
                    'llama3-8b-8192',
                    'mixtral-8x7b-32768',
                    'gemma2-9b-it',
                    'compound-beta',
                    'compound-beta-mini'
                  ];
                } else if (provider === 'claude') {
                  models = [
                    'claude-opus-4-5',
                    'claude-sonnet-4-5',
                    'claude-haiku-4-5',
                    'claude-3-5-sonnet-20241022',
                    'claude-3-5-haiku-20241022',
                    'claude-3-opus-20240229'
                  ];
                } else {
                  models = [
                    'gemini-3.1-pro-preview',
                    'gemini-3.1-flash-lite-preview',
                    'gemma-4-31b-it',
                    'gemma-4-26b-a4b-it',
                    'gemini-3.0-pro',
                    'gemini-3.0-flash',
                    'gemini-2.5-flash',
                    'gemini-2.5-pro',
                    'gemini-1.5-flash',
                    'gemini-1.5-pro'
                  ];
                }

                const activeModel = getCurrentModel();
                const modelChoices = [
                  ...models.map(m => ({ name: m === activeModel ? chalk.green(`✔ ${m}`) : `  ${m}`, value: m })),
                  { name: activeModel && !models.includes(activeModel) ? chalk.green('✔ Custom (Type your own)') : '  Custom (Type your own)', value: 'custom' }
                ];
                const newModel = await select({
                  message: `Select ${provider === 'deepseek' ? 'DeepSeek' : provider === 'groq' ? 'Groq' : provider === 'claude' ? 'Claude' : 'Gemini'} Model:`,
                  choices: modelChoices,
                  default: models.includes(activeModel) ? activeModel : 'custom'
                });

                let finalModel = newModel;
                if (newModel === 'custom') {
                  finalModel = await input({ message: `Enter custom ${provider} model name:`, default: getCurrentModel() });
                }

                setModel(finalModel);
                console.log(chalk.green(`Model updated to ${finalModel}`));
              } else if (cmd === '/rename-branch') {
                try {
                  const status = await getRepoStatus();
                  const oldBranch = status ? status.current : null;
                  if (!oldBranch) {
                    console.log(chalk.red('Could not determine the current branch.'));
                  } else {
                    console.log(chalk.gray(`Current branch: ${oldBranch}`));
                    const newBranchName = await input({ message: 'Enter the new branch name:' });
                    if (!newBranchName || !newBranchName.trim()) {
                      console.log(chalk.yellow('Aborted. No branch name provided.'));
                    } else {
                      const rnSpinner = ora('Renaming branch...').start();
                      try {
                        // 1. Rename locally
                        await git.branch(['-m', oldBranch, newBranchName]);
                        rnSpinner.text = 'Checking remote...';

                        // 2. Try to delete the old remote branch and push new one
                        let hadRemote = false;
                        try {
                          await execa('git', ['push', 'origin', '--delete', oldBranch]);
                          hadRemote = true;
                        } catch (e) {
                          // old branch may not exist on remote yet — that's fine
                        }

                        rnSpinner.text = 'Pushing new branch to remote...';
                        await git.push(['-u', 'origin', newBranchName]);

                        rnSpinner.succeed(chalk.green(
                          `Branch renamed: ${chalk.cyan(oldBranch)} → ${chalk.cyan(newBranchName)}` +
                          (hadRemote ? ' (remote updated)' : ' (pushed to remote)')
                        ));
                      } catch (err) {
                        rnSpinner.fail(chalk.red('Rename failed: ' + err.message));
                      }
                    }
                  }
                } catch (err) {
                  console.log(chalk.red('Rename branch error: ' + err.message));
                }
              } else if (cmd === '/bugs') {
                console.log(chalk.cyan('\n🐛 Report a Bug to GitNova\'s developer\n'));
                console.log(chalk.gray('Your report will be posted as a GitHub Issue on the GitNova repository.'));
                console.log(chalk.gray('The developer will be notified and can reply to you there.\n'));

                try {
                  const bugTitle = await input({ message: 'Short bug title (e.g. "Crash when using /stats"):' });
                  if (!bugTitle || !bugTitle.trim()) {
                    console.log(chalk.yellow('Aborted. No title provided.'));
                  } else {
                    const bugDesc = await input({ message: 'Describe what happened:' });
                    const bugSteps = await input({ message: 'What were you doing when it happened? (optional):' });

                    // Auto-collect environment info
                    let gitVer = 'unknown';
                    let ghVer = 'unknown';
                    try { gitVer = (await execa('git', ['--version'])).stdout.trim(); } catch (e) {}
                    try { ghVer = (await execa('gh', ['--version'])).stdout.split('\n')[0].trim(); } catch (e) {}


                    // Read version from global install path

                    let gitnovaVersion = 'unknown';
                    try {
                      const { stdout: verOut } = await execa('gitnova', ['--version'], { reject: false });
                      const match = verOut.match(/GitNova\s+v([\d.]+)/);
                      if (match) gitnovaVersion = match[1];
                    } catch (e) {}

                    const bugBody = [
                      '## Bug Report',
                      '',
                      '### Description',
                      bugDesc || '(no description provided)',
                      '',
                      '### Steps / Context',
                      bugSteps || '(not provided)',
                      '',
                      '### Environment',
                      `- **GitNova:** v${gitnovaVersion}`,
                      `- **OS:** ${process.platform} (${process.arch})`,
                      `- **Node.js:** ${process.version}`,
                      `- **Git:** ${gitVer}`,
                      `- **GitHub CLI:** ${ghVer}`,
                      '',
                      '---',
                      '*This report was submitted automatically via the `/bugs` command in GitNova.*'
                    ].join('\n');

                    const bugSpinner = ora('Submitting bug report to GitHub...').start();
                    try {
                      const { stdout: issueUrl } = await execa('gh', [
                        'issue', 'create',
                        '--repo', 'nourddinak/GitNova',
                        '--title', `Bug: ${bugTitle.trim()}`,
                        '--body', bugBody,
                        '--label', 'bug'
                      ]);
                      bugSpinner.succeed(chalk.green('Bug report submitted! Thank you.'));
                      console.log(chalk.cyan(`\nView your report: ${issueUrl.trim()}`));
                      console.log(chalk.gray('The developer will review and reply on GitHub.'));
                    } catch (err) {
                      bugSpinner.fail(chalk.red('Failed to submit bug report.'));
                      // Gracefully handle missing 'bug' label
                      if (err.stderr && err.stderr.includes('label')) {
                        console.log(chalk.yellow('Retrying without label tag...'));
                        try {
                          const { stdout: issueUrl } = await execa('gh', [
                            'issue', 'create',
                            '--repo', 'nourddinak/GitNova',
                            '--title', `Bug: ${bugTitle.trim()}`,
                            '--body', bugBody
                          ]);
                          console.log(chalk.green('Bug report submitted (without label).'));
                          console.log(chalk.cyan(`\nView your report: ${issueUrl.trim()}`));
                        } catch (e2) {
                          console.log(chalk.red('Could not submit: ' + (e2.stderr || e2.message)));
                          console.log(chalk.gray('You can report manually at: https://github.com/nourddinak/GitNova/issues'));
                        }
                      } else {
                        console.log(chalk.red(err.stderr || err.message));
                        console.log(chalk.gray('You can report manually at: https://github.com/nourddinak/GitNova/issues'));
                      }
                    }
                  }
                } catch (err) {
                  if (err.name !== 'ExitPromptError') {
                    console.log(chalk.red('Bug report cancelled.'));
                  }
                }
              } else if (cmd === '/privacy') {
                const privacyText =
                  chalk.cyan.bold('🔒 GitNova Privacy Policy\n') +
                  `${chalk.bold('What GitNova sends to AI providers:')}\n` +
                  chalk.gray('  • Your git diff (code changes) when generating commit messages\n') +
                  chalk.gray('  • File names in your repo when scanning for secrets/ignore rules\n') +
                  chalk.gray('  • This is sent to YOUR chosen provider (Gemini, DeepSeek, Groq, or Claude)\n') +
                  `\n${chalk.bold('What GitNova NEVER collects:')}\n` +
                  chalk.gray('  • Nothing is sent to the GitNova developer\n') +
                  chalk.gray('  • No telemetry, analytics, or usage tracking of any kind\n') +
                  chalk.gray('  • No account data, file contents, or personal information\n') +
                  `\n${chalk.bold('Bug reports (/bugs):')}\n` +
                  chalk.gray('  • Posted to GitHub Issues using YOUR GitHub account\n') +
                  chalk.gray('  • Includes: OS, GitNova version, Node version\n') +
                  chalk.gray('  • Does NOT include your code, API keys, or file contents\n') +
                  `\n${chalk.bold('Your API keys:')}\n` +
                  chalk.gray('  • Stored locally only in ~/.gitnova-config.json\n') +
                  chalk.gray('  • Never logged, transmitted, or shared\n') +
                  chalk.gray('  • Run "gitnova --uninstall" to delete them completely\n') +
                  `\n${chalk.gray('Source: https://github.com/nourddinak/GitNova')}`;

                console.log(boxen(privacyText, {
                  padding: 1,
                  margin: { top: 1, bottom: 1 },
                  borderStyle: 'round',
                  borderColor: 'green',
                  title: '🔒 Privacy',
                  titleAlignment: 'center'
                }));
              } else if (cmd === '/clear') {
                console.clear();
              } else if (cmd === '/help') {
                console.log(chalk.cyan('Available commands:'));
                console.log(' - /info    : View current repository status and GitHub details');
                console.log(' - /stats   : Show commit count, lines changed, and authors');
                console.log(' - /config  : View your current GitNova configuration (keys redacted)');
                console.log(' - /settings: Configure Auto Mode and behaviors');
                console.log(' - /provider: Switch between Gemini, DeepSeek, Groq, and Claude');
                console.log(' - /model   : Change the AI model used by GitNova');
                console.log(' - /key     : Change your API key');
                console.log(' - /ignore  : Manage your .gitignore settings');
                console.log(' - /rename-branch : Rename the current branch locally and on remote');
                console.log(' - /bugs   : Report a bug directly to the GitNova developer');
                console.log(' - /onboard : Generate an AI repository onboarding summary');
                console.log(' - /privacy : View what data GitNova uses and never collects');
                console.log(' - /clear   : Clear the terminal screen');
                console.log(' - /help    : Show this help message');
                console.log(chalk.cyan('\nCLI Arguments:'));
                console.log(' - gitnova --version       : Print GitNova, git, and gh versions.');
                console.log(' - gitnova --uninstall     : Cleanly remove config/API keys before uninstalling.');
                console.log(' - gitnova -auto           : Stays out of chat; automatically stages, AI-commits, and pushes.');
                console.log(' - gitnova -auto "message" : Stays out of chat; uses your custom commit message instead.');
              }
            } catch (e) {
              if (e.name === 'ExitPromptError') {
                slashMenuOpen = false;
                break;
              }
              throw e;
            }
          }
          continue;
        }
      }

    if (!userInput) {
        userInput = inputResult.value;
        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          console.log(chalk.cyan('Goodbye!'));
          process.exit(0);
        }

        if (!userInput.trim()) continue;
      }

      const status = await getRepoStatus().catch(() => null);
      let contextStr = '';
      if (status) {
        contextStr = `[Current Git Status]\nBranch: ${status.current}\nBehind: ${status.behind}\nAhead: ${status.ahead}\nModified: ${status.modified.length}\nStaged: ${status.staged.length}\nConflicted: ${status.conflicted.length}`;
      }

      const spinner = ora('Thinking...').start();
      const intentData = await parseIntent(userInput, contextStr, chatHistory);
      spinner.stop();

      const intents = Array.isArray(intentData) ? intentData : [intentData];

      try {
        for (const intent of intents) {
          let stopSequence = false;

          const gitActions = ['STATUS', 'ADD_ALL', 'COMMIT', 'PUSH', 'PULL', 'SYNC', 'CREATE_BRANCH', 'SWITCH_BRANCH'];
          if (gitActions.includes(intent.action)) {
            let isRepoStatus = await getRepoStatus();
            if (!isRepoStatus) {
              console.log(chalk.red('\nGit Error: The current directory is not a Git repository.'));
              const initAsk = await confirm({ message: 'Do you want to initialize a new Git repository here?', default: true });
              if (initAsk) {
                await git.init();
                console.log(chalk.green('✔ Initialized empty Git repository.'));
                isRepoStatus = await getRepoStatus();
              } else {
                continue;
              }
            }

            const remotes = await git.getRemotes();
            const hasOrigin = remotes.some(r => r.name === 'origin');
            if (!hasOrigin) {
              console.log(chalk.yellow('\n⚠️  Notice: This repository is not linked to GitHub (missing "origin" remote).'));
              let setupSuccess = false;
              while (!setupSuccess) {
                const setupChoice = await select({
                  message: 'How do you want to set up GitHub for this project? (Required)',
                  choices: [
                    { name: '🔗 Connect to an existing GitHub repository', value: 'existing' },
                    { name: '✨ Create a brand new private GitHub repository', value: 'create' }
                  ]
                });

                if (setupChoice === 'existing') {
                  const existingRepoName = await input({ message: 'Enter the repo name (or Username/Repo or full URL):' });
                  const lnkSpinner = ora('Linking and syncing history safely...').start();
                  try {
                    let finalUrl = existingRepoName;
                    if (!finalUrl.startsWith('http') && !finalUrl.startsWith('git@')) {
                      const { stdout } = await execa('gh', ['repo', 'view', finalUrl, '--json', 'url']);
                      finalUrl = JSON.parse(stdout).url;
                    }
                    if (!finalUrl.endsWith('.git')) finalUrl += '.git';
                    await git.remote(['add', 'origin', finalUrl]);
                    await git.fetch(['origin']);

                    let defaultBranch = 'main';
                    try {
                      const { stdout: branchOut } = await execa('git', ['ls-remote', '--symref', 'origin', 'HEAD']);
                      const match = branchOut.match(/ref: refs\/heads\/([^\s]+)\s+HEAD/);
                      if (match) defaultBranch = match[1];
                    } catch (e) { }

                    try { await git.branch(['-m', defaultBranch]); } catch (e) { }
                    await git.reset(['--mixed', `origin/${defaultBranch}`]);
                    lnkSpinner.succeed(chalk.green(`Linked and reliably synced with origin/${defaultBranch}! Working directory preserved.`));
                    setupSuccess = true;
                  } catch (err) {
                    lnkSpinner.fail(chalk.yellow(`Could not auto-sync: ${err.message}`));
                    console.log(chalk.red('Please try again or use a different repository name.'));
                  }
                } else if (setupChoice === 'create') {
                  const defaultName = path.basename(process.cwd());
                  const newRepoName = await input({ message: 'Enter new repository name:', default: defaultName });
                  const spinner = ora('Creating new GitHub repository and pushing...').start();
                  try {
                    await execa('gh', ['repo', 'create', newRepoName, '--private', '--source=.', '--remote=origin', '--default-branch=main']);
                    const branch = await getCurrentBranch() || 'main';
                    spinner.text = 'Pushing...';
                    await git.push(['-u', 'origin', branch]);
                    spinner.succeed(chalk.green(`Created private repo '${newRepoName}' on GitHub and pushed your code!`));
                    setupSuccess = true;
                  } catch (err) {
                    spinner.fail(chalk.red('Failed to create repo: ' + (err.stderr || err.message)));
                    console.log(chalk.yellow('Ensure the GitHub CLI (gh) is authenticated via "gh auth login" and try again.'));
                  }
                }
              }
            }
          }

          switch (intent.action) {
            case 'STATUS': {
              const statusObj = await getRepoStatus();
              if (statusObj) {
                console.log(chalk.green(`Current Branch: ${statusObj.current}`));
                if (statusObj.files.length > 0) {
                  console.log(chalk.yellow('Modified files:'));
                  statusObj.files.forEach(f => console.log(chalk.gray(` - ${f.path}`)));
                } else {
                  console.log(chalk.green('Working directory clean.'));
                }
              }
              break;
            }

            case 'ADD_ALL': {
              if (!(await checkDangerousStaging())) break;
              await git.add('.');
              console.log(chalk.green('Staged all changes.'));
              break;
            }

            case 'COMMIT': {
              let message = intent.message;
              const statusObj = await getRepoStatus();
              if (statusObj.staged.length === 0) {
                const addConfirm = await confirm({ message: 'No files staged. Stage all files now?' });
                if (addConfirm) {
                  if (!(await checkDangerousStaging())) {
                    console.log(chalk.yellow('Commit aborted.'));
                    break;
                  }
                  await git.add('.');
                } else {
                  console.log(chalk.yellow('Commit aborted.'));
                  break;
                }
              }

              if (!message || message.trim() === 'optional message') {
                const diffSpinner = ora('Generating commit message using AI...').start();
                let diff = await getStagedDiff();
                if (!diff) {
                  diff = await getDiff();
                }
                const aiMessage = await generateCommitMessage(diff);
                diffSpinner.stop();

                if (aiMessage) {
                  console.log(chalk.cyan(`\nProposed commit message:\n${aiMessage}\n`));
                  const editOrAccept = await confirm({ message: 'Accept this commit message?' });
                  if (!editOrAccept) {
                    message = await editor({ message: 'Edit commit message:', default: aiMessage });
                  } else {
                    message = aiMessage;
                  }
                } else {
                  message = await input({ message: 'Enter commit message:' });
                }
              }

              if (message) {
                const res = await git.commit(message);
                console.log(chalk.green(`Committed [${res.commit}] ${message}`));

                const hasPushIntent = intents.some(i => i.action === 'PUSH' || i.action === 'SYNC');
                if (!hasPushIntent) {
                  const doPushAsk = await confirm({ message: chalk.cyan('❓ Do you want to push these changes to the remote now?'), default: true });
                  if (doPushAsk) {
                    intents.push({ action: 'PUSH', _autoPrompted: true });
                  }
                }
              } else {
                console.log(chalk.yellow('Commit aborted. No message provided.'));
              }
              break;
            }

            case 'PUSH': {
              const res = await executeSecurePush(false, intent.force === true);
              if (res && res.success === false && res.reason === 'PUSH_REJECTED_NEW_COMMITS') {
                autoPromptError = `I attempted to push, but the remote branch has commits that we do not have locally.\nTo fix this gracefully, output {"action": "SYNC"} which pulls then pushes. If the user explicitly requested to push directly and overwrite the remote, output {"action": "PUSH", "force": true}.`;
                stopSequence = true;
              } else if (res && res.success === false) {
                autoPromptError = `Push failed with reason: ${res.reason}.\nOutput: ${res.error}`;
                stopSequence = true;
              }
              break;
            }

            case 'SYNC': {
              const syncPullSpinner = ora('Syncing: Pulling remote changes...').start();
              try {
                await git.pull(['--rebase']);
                syncPullSpinner.succeed(chalk.green('Pulled successfully.'));
              } catch (e) {
                syncPullSpinner.fail(chalk.red('Pull failed.'));
                autoPromptError = `The git pull failed with error:\n${e.message}\nPlease resolve these merge conflicts using RUN_COMMANDS or give me instructions via CHAT.`;
                stopSequence = true;
                break;
              }
              const res = await executeSecurePush(false);
              if (res && res.success === false && res.reason === 'MERGE_CONFLICT') {
                autoPromptError = `Merge conflict during sync push:\n${res.error}`;
                stopSequence = true;
              }
              break;
            }

            case 'PULL': {
              const pullSpinner = ora('Pulling latest changes...').start();
              await git.pull();
              pullSpinner.succeed(chalk.green('Pull successful.'));
              break;
            }

            case 'CREATE_BRANCH': {
              if (!intent.branchName) {
                intent.branchName = await input({ message: 'Enter new branch name:' });
              }
              await git.checkoutLocalBranch(intent.branchName);
              console.log(chalk.green(`Created and switched to branch '${intent.branchName}'`));
              break;
            }

            case 'SWITCH_BRANCH': {
              if (!intent.branchName) {
                intent.branchName = await input({ message: 'Enter branch name to switch to:' });
              }
              await git.checkout(intent.branchName);
              console.log(chalk.green(`Switched to branch '${intent.branchName}'`));
              break;
            }

            case 'RUN_COMMAND':
            case 'RUN_COMMANDS': {
              const commands = intent.commands || (intent.command ? [intent.command] : []);

              if (commands.length === 0) {
                console.log(chalk.red('AI proposed running commands, but no commands were provided.'));
                break;
              }

              console.log(chalk.yellow('AI proposes running the following commands:'));
              commands.forEach(c => console.log(chalk.gray(`> ${c}`)));
              console.log(chalk.italic(`(${intent.description})`));

              const runCmd = await confirm({ message: chalk.bold('Do you want to run these commands?') });
              if (runCmd) {
                let outputLog = '';
                let successAll = true;
                for (const cmd of commands) {
                  console.log(chalk.cyan(`\nExecuting: ${cmd}`));
                  try {
                    let child;
                    if (process.platform === 'win32') {
                      const shell = 'powershell.exe';
                      child = execa(cmd, { shell: shell, all: true });
                    } else {
                      child = execa(cmd, { shell: true, all: true });
                    }
                    child.stdout.pipe(process.stdout);
                    child.stderr.pipe(process.stderr);

                    const { all: output } = await child;
                    outputLog += `\n[Command: ${cmd}]\n${output}\n`;
                  } catch (err) {
                    console.log(chalk.red('\nCommand failed. Aborting subsequent sequence.'));
                    const errorLog = err.all || err.message;
                    autoPromptError = `The command "${cmd}" failed with the following error output:\n${errorLog}\n\nPlease analyze this error, briefly explain what happened, and if you can fix it natively, use RUN_COMMANDS to propose the fix.`;
                    successAll = false;
                    break;
                  }
                }

                if (successAll && outputLog.trim()) {
                  const summarySpinner = ora('Asking AI to explain the results...').start();
                  const summary = await summarizeCommandOutput(commands, outputLog);
                  summarySpinner.stop();
                  console.log(boxen(gradient.pastel(summary), { padding: 1, margin: { top: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'magenta', title: '🤖 AI Summary', titleAlignment: 'left' }));
                }
              } else {
                console.log(chalk.yellow('Commands aborted.'));
              }
              break;
            }

            case 'CHAT': {
              console.log(boxen(gradient.pastel(intent.reply || ''), { padding: 1, margin: { top: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'magenta', title: '🤖 AI', titleAlignment: 'left' }));
              break;
            }

            case 'UNKNOWN':
            default: {
              console.log(boxen(gradient.pastel(intent.reply || "I didn't quite understand that Git action."), { padding: 1, margin: { top: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'magenta', title: '🤖 AI', titleAlignment: 'left' }));
              break;
            }
          }

          if (stopSequence) {
            break;
          }
        }
      } catch (error) {
        if (error && (error.name === 'ExitPromptError' || (error.message && error.message.includes('force closed')))) {
          console.log(chalk.cyan('\nGoodbye!'));
          process.exit(0);
        }
        console.error(chalk.red('\nGit Error:'), error.message);
        const explainSpinner = ora('Asking AI to explain error...').start();
        let act = 'UNKNOWN';
        try { act = intentData[0].action; } catch (e) { }
        const explanation = await explainError(error.message, act);
        explainSpinner.stop();
        console.log(boxen(chalk.yellow(explanation), { padding: 1, margin: { top: 1, bottom: 1 }, borderStyle: 'round', borderColor: 'red', title: '⚠️ AI Explanation', titleAlignment: 'left' }));
      }
    }
  }
