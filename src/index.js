import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import { checkGitInstalled, installGitDesktop, checkGhInstalled, installGh } from './utils/system.js';
import { ensureGitRepo } from './utils/git.js';
import { checkGitHubAuth, loginGitHub } from './utils/github.js';
import { ensureApiKey, getCurrentModel } from './utils/ai.js';
import { startChatSession, autoCommitAndPush } from './chat/session.js';
import { checkUpdate } from './utils/update.js';
import os from 'os';
import { createRequire } from 'module';
import { execa } from 'execa';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export async function main() {
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
  
  // Display system and model info
  console.log(chalk.cyan(`   OS: ${os.type()} ${os.release()} (${os.arch()})`));
  console.log(chalk.cyan(`   Model: ${getCurrentModel()}`));
  console.log('\n');

  await checkUpdate();

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
