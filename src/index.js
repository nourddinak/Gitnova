import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import { checkGitInstalled, installGitDesktop, checkGhInstalled, installGh } from './utils/system.js';
import { ensureGitRepo } from './utils/git.js';
import { checkGitHubAuth, loginGitHub } from './utils/github.js';
import { ensureApiKey, getCurrentModel } from './utils/ai.js';
import { startChatSession, autoCommitAndPush } from './chat/session.js';
import { checkUpdate, showChangelog, getNpmDownloads } from './utils/update.js';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { confirm } from '@inquirer/prompts';
import { createRequire } from 'module';
import { execa } from 'execa';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/** Always checks GitHub API for star status — if starred, silent. If not, prompts until they do. */
async function checkAndPromptStar() {
  const configPath = path.join(os.homedir(), '.gitnova-config.json');
  let config = {};
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}

  let isStarred = false;
  try {
    // Always verify with GitHub — source of truth
    const { exitCode } = await execa('gh', ['api', 'user/starred/nourddinak/GitNova'], { reject: false });
    isStarred = exitCode === 0;
  } catch (e) {
    return; // gh not available or network issue — skip silently
  }

  if (isStarred) {
    // Starred — update config and return silently
    config.hasStarred = true;
    fs.writeFileSync(configPath, JSON.stringify(config));
    return;
  }

  // Not starred — show the prompt
  console.log('');
  console.log(chalk.yellow('  ⭐ Enjoying GitNova? Star it on GitHub to help it grow!'));
  console.log(chalk.gray('     It takes one click and means a lot.'));
  console.log('');

  try {
    const doStar = await confirm({ message: chalk.bold('Star GitNova on GitHub now?'), default: true });
    if (doStar) {
      try {
        await execa('gh', ['api', 'user/starred/nourddinak/GitNova', '-X', 'PUT']);
        console.log(chalk.green('  ⭐ Thank you for starring GitNova! You rock.\n'));
        config.hasStarred = true;
        fs.writeFileSync(configPath, JSON.stringify(config));
      } catch (e) {
        console.log(chalk.red('  Could not star automatically. Visit: https://github.com/nourddinak/GitNova\n'));
      }
    } else {
      console.log(chalk.gray('  No worries — you can star it anytime at github.com/nourddinak/GitNova\n'));
    }
  } catch (e) {
    // User Ctrl+C'd the prompt — skip silently
  }
}

export async function main() {
  // --uninstall: clean up config file with API keys, then guide through uninstall
  if (process.argv.includes('--uninstall')) {
    const configPath = path.join(os.homedir(), '.gitnova-config.json');
    console.log(chalk.yellow('\n⚠️  GitNova Uninstall Helper\n'));
    console.log(chalk.gray(`This will delete your config file (API keys, settings):`));
    console.log(chalk.gray(`  ${configPath}\n`));
    try {
      const doIt = await confirm({ message: 'Delete config file and uninstall GitNova?', default: false });
      if (doIt) {
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
          console.log(chalk.green('✔ Config file deleted.'));
        } else {
          console.log(chalk.gray('No config file found — nothing to delete.'));
        }
        console.log(chalk.cyan('\nNow run:  npm uninstall -g gitnova'));
        console.log(chalk.gray('GitNova has been fully removed. Goodbye!\n'));
      } else {
        console.log(chalk.yellow('Cancelled. Nothing was deleted.'));
      }
    } catch (e) {}
    process.exit(0);
  }

  // --version / -v: print versions and exit immediately (no banner, no startup checks)
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    let gitVer = 'unknown';
    let ghVer = 'unknown';
    try { gitVer = (await execa('git', ['--version'])).stdout.trim(); } catch (e) {}
    try { ghVer = (await execa('gh', ['--version'])).stdout.split('\n')[0].trim(); } catch (e) {}
    console.log(chalk.cyan(`GitNova  v${pkg.version}`));
    console.log(chalk.gray(`Git      ${gitVer}`));
    console.log(chalk.gray(`GitHub   ${ghVer}`));
    console.log(chalk.gray(`Node.js  ${process.version}`));
    console.log(chalk.gray(`OS       ${os.type()} ${os.release()} (${os.arch()})`));
    process.exit(0);
  }

  console.clear();
  // Display a cool 3D gradient banner
  const banner = figlet.textSync('GitNova', { font: '3D Diagonal' });
  console.log(gradient.pastel.multiline(banner));
  
  // Display system and model info + npm downloads (fetched in parallel)
  const [, , downloadsCount] = await Promise.allSettled([
    checkUpdate(),
    Promise.resolve(showChangelog()),
    getNpmDownloads()
  ]);
  const downloads = downloadsCount.status === 'fulfilled' && downloadsCount.value
    ? chalk.gray(`  📦 ${downloadsCount.value.toLocaleString()} downloads last month`)
    : '';

  console.log(chalk.cyan(`   OS: ${os.type()} ${os.release()} (${os.arch()})`) + (downloads ? `   ${downloads}` : ''));
  console.log(chalk.cyan(`   Model: ${getCurrentModel()}`));
  console.log('\n');


  // 1. Check Git
  const gitInstalled = await checkGitInstalled();
  if (!gitInstalled) {
    await installGitDesktop();
  }

  // 2. Check Repo
  await ensureGitRepo();

  // 3. Check GitHub CLI & Auth
  const ghInstalled = await checkGhInstalled();
  if (!ghInstalled) {
    await installGh();
  } else {
    const ghAuthed = await checkGitHubAuth();
    if (!ghAuthed) {
      await loginGitHub();
    } else {
      // Show who is logged in
      try {
        const { stdout: ghUser } = await execa('gh', ['api', 'user', '--jq', '.login'], { reject: false });
        if (ghUser && ghUser.trim()) {
          console.log(chalk.green(`✔ GitHub: logged in as @${ghUser.trim()}`));
        }
      } catch (e) {}
      try {
        const { stdout: gitName } = await execa('git', ['config', 'user.name'], { reject: false });
        const { stdout: gitEmail } = await execa('git', ['config', 'user.email'], { reject: false });
        const name = gitName ? gitName.trim() : '';
        const email = gitEmail ? gitEmail.trim() : '';
        if (name || email) {
          console.log(chalk.green(`✔ Git user: ${name}${email ? ` <${email}>` : ''}`));
        }
      } catch (e) {}
      // Star prompt
      await checkAndPromptStar();
    }
  }

  // 4. Ensure API Key
  await ensureApiKey();

  // Check for auto flag
  const autoIndex = process.argv.findIndex(arg => arg === '--auto' || arg === '-auto');
  const isAutoMode = autoIndex !== -1;

  if (isAutoMode) {
    let customMessage = null;
    if (autoIndex + 1 < process.argv.length) {
      customMessage = process.argv[autoIndex + 1];
    }
    await autoCommitAndPush(customMessage);
  } else {
    // 5. Start REPL
    await startChatSession();
  }
}
