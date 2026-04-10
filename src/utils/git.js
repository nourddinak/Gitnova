import simpleGit from 'simple-git';
import { confirm, input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import path from 'path';

export const git = simpleGit();

export async function isGitRepo() {
  try {
    const isRepo = await git.checkIsRepo();
    return isRepo;
  } catch (e) {
    return false;
  }
}

export async function ensureGitRepo() {
  let isRepo = await isGitRepo();
  if (!isRepo) {
    console.log(chalk.yellow('The current directory is not a Git repository.'));
    const answer = await confirm({ message: 'Do you want to initialize a new Git repository here?' });
    if (answer) {
      await git.init();
      console.log(chalk.green('Initialized empty Git repository.'));
      isRepo = true;
    } else {
      console.log(chalk.red('GitNova requires a Git repository to perform most commands. Exiting.'));
      process.exit(1);
    }
  }

  // Mandatory Remote check/setup
  const remotes = await git.getRemotes();
  const hasOrigin = remotes.some(r => r.name === 'origin');
  let originIsValid = hasOrigin;
  
  if (hasOrigin) {
      try {
          await execa('git', ['ls-remote', '--exit-code', 'origin']);
      } catch (e) {
          const errMsg = e.message || '';
          if (errMsg.includes('Repository not found') || errMsg.includes('not found') || errMsg.includes('404')) {
              originIsValid = false;
              console.log(chalk.red('\n⚠️  The remote repository "origin" was not found on GitHub. It may have been deleted, renamed, or you lost access.'));
          }
      }
  }
  
  if (!originIsValid) {
      if (!hasOrigin) {
          console.log(chalk.yellow('\n⚠️  Notice: This repository is not linked to GitHub (missing "origin" remote).'));
      }
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
                 try { await git.remote(['remove', 'origin']); } catch (e) {}
                 await git.remote(['add', 'origin', finalUrl]);
                 await git.fetch(['origin']);
                 
                 let defaultBranch = 'master';
                 try {
                     const { stdout: branchOut } = await execa('git', ['ls-remote', '--symref', 'origin', 'HEAD']);
                     const match = branchOut.match(/ref: refs\/heads\/([^\s]+)\s+HEAD/);
                     if (match) defaultBranch = match[1];
                 } catch(e) {}
                 
                 try { await git.branch(['-m', defaultBranch]); } catch(e){}
                 
                 try {
                     await git.reset(['--mixed', `origin/${defaultBranch}`]);
                     lnkSpinner.succeed(chalk.green(`Linked and reliably synced with origin/${defaultBranch}! Working directory preserved.`));
                 } catch (resetErr) {
                     if (resetErr.message.includes('ambiguous argument') || resetErr.message.includes('unknown revision')) {
                         lnkSpinner.succeed(chalk.green(`Linked to remote successfully! (Remote repository appears to be empty).`));
                     } else {
                         throw resetErr;
                     }
                 }
                 setupSuccess = true;
              } catch(err) {
                 lnkSpinner.fail(chalk.yellow(`Could not auto-sync: ${err.message}`));
                 console.log(chalk.red('Please try again or use a different repository name.'));
              }
          } else if (setupChoice === 'create') {
              const defaultName = path.basename(process.cwd());
              const newRepoName = await input({ message: 'Enter new repository name:', default: defaultName });
              const spinner = ora('Creating new GitHub repository and pushing...').start();
              try {
                  try { await git.remote(['remove', 'origin']); } catch(e) {}
                  
                  // Ensure there is at least one commit
                  try {
                      await git.log();
                  } catch (e) {
                      spinner.text = 'Creating initial commit...';
                      await git.add('.');
                      await git.commit('Initial commit');
                  }

                  await execa('gh', ['repo', 'create', newRepoName, '--private', '--source=.', '--remote=origin']);
                  const branch = await getCurrentBranch() || 'master';
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

export async function getRepoStatus() {
  if (!(await isGitRepo())) return null;
  
  const status = await git.status();
  return status;
}

export async function getDiff() {
  if (!(await isGitRepo())) return '';
  return await git.diff();
}

export async function getStagedDiff() {
  if (!(await isGitRepo())) return '';
  return await git.diff(['--staged']);
}

export async function getCurrentBranch() {
  if (!(await isGitRepo())) return null;
  const status = await git.status();
  return status.current;
}

export async function getUnpushedFiles() {
  if (!(await isGitRepo())) return [];
  try {
     const status = await git.status();
     const currentBranch = status.current;
     
     try {
       const res = await git.raw(['diff', '--name-only', `origin/${currentBranch}...HEAD`]);
       return res.split('\n').filter(r => r.trim() !== '');
     } catch (e) {
       try {
         const res = await git.raw(['diff', '--name-only', 'origin/main...HEAD']);
         return res.split('\n').filter(r => r.trim() !== '');
       } catch (err) {
         const res = await git.raw(['diff', '--name-only', 'HEAD~1...HEAD']).catch(() => '');
         return res.split('\n').filter(r => r.trim() !== '');
       }
     }
  } catch (e) {
     return [];
  }
}
