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

export async function main() {
  console.clear();
  // Display a cool 3D gradient banner
  const banner = figlet.textSync('GitNova', { font: '3D Diagonal' });
  console.log(gradient.pastel.multiline(banner));
  
  // Display system and model info
  console.log(chalk.cyan(`   OS: ${os.type()} ${os.release()} (${os.arch()})`));
  console.log(chalk.cyan(`   Model: ${getCurrentModel()}`));
  console.log('\n');

  await checkUpdate();

  if (os.platform() !== 'win32') {
    console.error(chalk.red('Sorry, GitNova CLI is currently only supported on Windows.'));
    process.exit(1);
  }

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
