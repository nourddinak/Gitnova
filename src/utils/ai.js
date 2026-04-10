import { GoogleGenAI } from '@google/genai';
import { input } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import * as dotenv from 'dotenv';

dotenv.config();

let aiClient = null;
let currentProvider = process.env.AI_PROVIDER || 'gemini';
let currentModel = process.env.AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
let currentDeepseekKey = process.env.DEEPSEEK_API_KEY || null;
let currentGroqKey = process.env.GROQ_API_KEY || null;

try {
  const configPath = path.join(os.homedir(), '.gitnova-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.provider && !process.env.AI_PROVIDER) currentProvider = config.provider;
    if (config.model && !process.env.AI_MODEL && !process.env.GEMINI_MODEL) currentModel = config.model;
    if (config.deepseekApiKey && !currentDeepseekKey) currentDeepseekKey = config.deepseekApiKey;
    if (config.groqApiKey && !currentGroqKey) currentGroqKey = config.groqApiKey;
  }
} catch(e) {}

/**
 * Pre-filters a list of filesystem items against existing .gitignore patterns.
 * Returns only items NOT already covered, so the AI never re-flags them.
 */
function filterAlreadyIgnored(items, gitignoreContent) {
  if (!gitignoreContent) return items;

  const patterns = gitignoreContent
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('!'));

  return items.filter(item => {
    const bare = item.replace(/\/$/, '');
    return !patterns.some(pattern => {
      const barePattern = pattern.replace(/\/$/, '');
      if (barePattern === bare || barePattern === item) return true;
      if (barePattern.startsWith('*')) {
        const ext = barePattern.slice(1);
        if (bare.endsWith(ext)) return true;
      }
      if (bare.startsWith(barePattern + '/') || bare === barePattern) return true;
      return false;
    });
  });
}

export async function ensureApiKey() {
  const configPath = path.join(os.homedir(), '.gitnova-config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) {}
  }

  if (currentProvider === 'deepseek') {
    if (!currentDeepseekKey && config.deepseekApiKey) {
      currentDeepseekKey = config.deepseekApiKey;
    }
    if (!currentDeepseekKey) {
      console.log(chalk.yellow('DeepSeek API key is required to use DeepSeek models.'));
      currentDeepseekKey = await input({ message: 'Please enter your DeepSeek API Key:', type: 'password' });
      if (currentDeepseekKey) {
        config.deepseekApiKey = currentDeepseekKey;
        config.provider = currentProvider;
        if (!config.model || config.model.includes('gemini')) config.model = 'deepseek-chat';
        currentModel = config.model;
        fs.writeFileSync(configPath, JSON.stringify(config));
        console.log(chalk.green('DeepSeek API Key saved locally.'));
      } else {
        console.log(chalk.red('API Key is required. Exiting...'));
        process.exit(1);
      }
    }
    return;
  }

  if (currentProvider === 'groq') {
    if (!currentGroqKey && config.groqApiKey) {
      currentGroqKey = config.groqApiKey;
    }
    if (!currentGroqKey) {
      console.log(chalk.yellow('Groq API key is required. Get one free at https://console.groq.com/keys'));
      currentGroqKey = await input({ message: 'Please enter your Groq API Key:', type: 'password' });
      if (currentGroqKey) {
        config.groqApiKey = currentGroqKey;
        config.provider = currentProvider;
        if (!config.model || (!config.model.includes('llama') && !config.model.includes('mixtral') && !config.model.includes('gemma'))) {
          config.model = 'llama-3.3-70b-versatile';
        }
        currentModel = config.model;
        fs.writeFileSync(configPath, JSON.stringify(config));
        console.log(chalk.green('Groq API Key saved locally.'));
      } else {
        console.log(chalk.red('API Key is required. Exiting...'));
        process.exit(1);
      }
    }
    return;
  }

  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && config.geminiApiKey) {
    apiKey = config.geminiApiKey;
  }

  if (!apiKey) {
    console.log(chalk.yellow('Gemini API key is required to use AI features.'));
    apiKey = await input({ message: 'Please enter your Gemini API Key:', type: 'password' });
    if (apiKey) {
      config.geminiApiKey = apiKey;
      config.provider = 'gemini';
      if (!config.model || config.model.includes('deepseek')) config.model = 'gemini-2.5-flash';
      currentModel = config.model;
      fs.writeFileSync(configPath, JSON.stringify(config));
      console.log(chalk.green('API Key saved locally.'));
    } else {
      console.log(chalk.red('API Key is required. Exiting...'));
      process.exit(1);
    }
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
}

async function generateWithFallback(options) {
  if (currentProvider === 'deepseek') {
    let messages = [];
    if (typeof options.contents === 'string') {
      messages = [{ role: 'user', content: options.contents }];
    } else {
      options.contents.forEach(item => {
        let role = item.role === 'model' ? 'assistant' : item.role;
        if (!role) role = 'user';
        messages.push({ role: role, content: item.parts[0].text });
      });
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentDeepseekKey}`
      },
      body: JSON.stringify({
        model: currentModel || 'deepseek-chat',
        messages: messages
      })
    });

    if (!response.ok) {
      const errObj = await response.json().catch(() => ({}));
      throw new Error(`DeepSeek API Error: ${response.status} ${response.statusText} - ${JSON.stringify(errObj)}`);
    }

    const data = await response.json();
    return { text: data.choices[0].message.content };
  }

  if (currentProvider === 'groq') {
    let messages = [];
    if (typeof options.contents === 'string') {
      messages = [{ role: 'user', content: options.contents }];
    } else {
      options.contents.forEach(item => {
        let role = item.role === 'model' ? 'assistant' : item.role;
        if (!role) role = 'user';
        messages.push({ role: role, content: item.parts[0].text });
      });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentGroqKey}`
      },
      body: JSON.stringify({
        model: currentModel || 'llama-3.3-70b-versatile',
        messages: messages
      })
    });

    if (!response.ok) {
      const errObj = await response.json().catch(() => ({}));
      throw new Error(`Groq API Error: ${response.status} ${response.statusText} - ${JSON.stringify(errObj)}`);
    }

    const data = await response.json();
    return { text: data.choices[0].message.content };
  }

  try {
    return await aiClient.models.generateContent(options);
  } catch (error) {
    if (error.status === 404 || (error.message && (error.message.includes('not found') || error.message.includes('deprecated')))) {
      options.model = 'gemini-1.5-flash';
      return await aiClient.models.generateContent(options);
    }
    throw error;
  }
}

export async function generateCommitMessage(diff) {
  if (!aiClient) await ensureApiKey();
  const prompt = `You are an expert developer. Given the following git diff, generate a concise, conventional commit message. Do not include any explanations or markdown formatting like backticks, just the commit message itself.\n\nDiff:\n${diff}`;
  
  try {
    const response = await generateWithFallback({
      model: currentModel,
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error(chalk.red('Error generating commit message:'), error.message);
    return null;
  }
}

export async function parseIntent(userInput, contextStr = '', chatHistory = []) {
  if (!aiClient) await ensureApiKey();
  const systemPrompt = `You are a Developer CLI Assistant. The user's OS is Windows (PowerShell). The user exclusively uses GitHub for remote Git repositories and has the GitHub CLI (gh) installed.
You MUST output either a single JSON action object OR an array of JSON action objects if multiple steps are needed to strictly fulfill the user's intent.
Available actions:
{ "action": "STATUS" }
{ "action": "ADD_ALL" }
{ "action": "COMMIT", "message": "optional message" }
{ "action": "PUSH", "force": true } // force is optional
{ "action": "PULL" }
{ "action": "SYNC" } // Equivalent to gracefully pulling then pushing 
{ "action": "CREATE_BRANCH", "branchName": "name" }
{ "action": "SWITCH_BRANCH", "branchName": "name" }
{ "action": "RUN_COMMANDS", "commands": ["powershell_or_git_command_1", "command_2"], "description": "short description of what this will do" }
{ "action": "CHAT", "reply": "A helpful, conversational reply answering the user normally like a friendly chatbot." }

If the user asks to perform basic Git actions (especially committing, pushing, pulling, or status), YOU MUST ALWAYS output the exact corresponding action JSON immediately (e.g., {"action": "COMMIT"}). NEVER use RUN_COMMANDS to manually build \`git commit\` or \`git push\` sequences! The CLI's native COMMIT action already handles auto-staging, message generation, and pushing internally.
If a PULL is rejected because the remote has changes (e.g., 'fetch first'), or if you encounter an error about "unrelated histories", do NOT attempt to use RUN_COMMANDS to run \`git pull --allow-unrelated-histories\`. This creates nasty merge conflicts! Instead, output {"action": "CHAT", "reply": "The remote repository has existing changes. Do you want to Force Push and overwrite them, or Abort?"} and let the user request a force push manually.
If the user explicitly requests to push directly, force push, or ignore remote changes, output [{"action": "PUSH", "force": true}].

--- 🛠️ AI KNOWLEDGE & AUTO-HEALING ---
- If your previous command failed (check chat history for errors), ANALYZE the error output and propose an ACTION that fixes it. Do not just repeat the same command.
- COMMAND FIX: \`gh repo edit --visibility <public|private>\` MUST also include the flag \`--accept-visibility-change-consequences\`.
- If a command fails and you don't know the fix, use {"action": "CHAT", "reply": "explanation of error"} to ask for user help.

For ANY OTHER OS command or advanced git operation not listed above (like creating repositories, changing gitconfig, npm install), construct a RUN_COMMANDS array.
Reply ONLY with valid JSON. No markdown backticks.

${contextStr}
`;

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Acknowledged. I will output only valid JSON.' }] },
    ...chatHistory,
    { role: 'user', parts: [{ text: userInput }] }
  ];

  try {
    const response = await generateWithFallback({
      model: currentModel,
      contents: contents,
    });
    
    let text = response.text.trim();
    chatHistory.push({ role: 'user', parts: [{ text: userInput }] });
    chatHistory.push({ role: 'model', parts: [{ text }] });
    
    // Keep history bounded to avoid token bloat (last 10 turns = 20 messages)
    while (chatHistory.length > 20) chatHistory.shift();

    const jsonMatch = text.match(/[\{\[][\s\S]*[\}\]]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (error) {
    console.error(chalk.red('AI Parsing Error:'), error.message);
    return { action: 'ERROR' };
  }
}

export async function explainError(errorMessage, gitCommand) {
  if (!aiClient) await ensureApiKey();
  const prompt = `You are a helpful Git assistant. The user ran "${gitCommand}" and got this error:\n${errorMessage}\nExplain this error in simple human language and suggest a fix. Be concise.`;
  
  try {
    const response = await generateWithFallback({
      model: currentModel,
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    return 'Could not generate explanation.';
  }
}

export function getProvider() {
  return currentProvider;
}

export function setProvider(newProvider) {
  currentProvider = newProvider;
  if (newProvider === 'deepseek') {
    currentModel = 'deepseek-chat';
  } else if (newProvider === 'groq') {
    currentModel = 'llama-3.3-70b-versatile';
  } else {
    currentModel = 'gemini-2.5-flash';
  }
  try {
    const configPath = path.join(os.homedir(), '.gitnova-config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e){}
    }
    config.provider = currentProvider;
    config.model = currentModel;
    fs.writeFileSync(configPath, JSON.stringify(config));
  } catch (e) {
    console.error(chalk.red('Failed to save config:'), e.message);
  }
}

export function getCurrentModel() {
  return currentModel;
}

export function setModel(newModel) {
  currentModel = newModel;
  try {
    const configPath = path.join(os.homedir(), '.gitnova-config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) {}
    }
    config.model = currentModel;
    fs.writeFileSync(configPath, JSON.stringify(config));
  } catch (e) {
    console.error(chalk.red('Failed to save config:'), e.message);
  }
}

export function getAutoSettings() {
  const configPath = path.join(os.homedir(), '.gitnova-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.autoIgnoreBehavior || 'ask_me'; // defaults: 'ask_me', 'notify', 'auto_ignore', 'push_anyway'
    } catch(e) {}
  }
  return 'ask_me';
}

export function setAutoSettings(behavior) {
  const configPath = path.join(os.homedir(), '.gitnova-config.json');
  try {
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    config.autoIgnoreBehavior = behavior;
    fs.writeFileSync(configPath, JSON.stringify(config));
  } catch (e) {
    console.error(chalk.red('Failed to save config:'), e.message);
  }
}

export async function setApiKey() {
  const configPath = path.join(os.homedir(), '.gitnova-config.json');
  let providerName;
  if (currentProvider === 'deepseek') providerName = 'DeepSeek';
  else if (currentProvider === 'groq') providerName = 'Groq';
  else providerName = 'Gemini';

  const newKey = await input({ message: `Enter new ${providerName} API Key:`, type: 'password' });

  if (newKey) {
    let config = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e) {}
    }

    if (currentProvider === 'deepseek') {
      config.deepseekApiKey = newKey;
      currentDeepseekKey = newKey;
    } else if (currentProvider === 'groq') {
      config.groqApiKey = newKey;
      currentGroqKey = newKey;
    } else {
      config.geminiApiKey = newKey;
      aiClient = new GoogleGenAI({ apiKey: newKey });
    }
    fs.writeFileSync(configPath, JSON.stringify(config));

    console.log(chalk.green('API Key updated and saved safely.'));
    return true;
  }
  return false;
}

export async function auditPushPayload(filesList) {
  if (!aiClient) await ensureApiKey();
  if (filesList.length === 0) return [];
  
  const prompt = `You are a strict cybersecurity and Git project auditor. 
Review the following list of files preparing to be pushed to a remote repository.
Identify any files that are highly risky or shouldn't be pushed natively. This includes:
- Secrets (.env, secure config files with credentials, API keys)
- Database chunks/caches (*.sqlite, *.db)
- Large dependencies/auto-builds (node_modules, dist, builds)
- Temporary IDE settings or local logs (.idea, .vscode, *.log)

Do NOT flag standard source code folders (src/) or mandatory binary entry points (bin/) as risky, as they are essential for the project's logic and publication.

File list:
${filesList.join('\n')}

Output your findings as a strict JSON array of objects, where each object has:
- "file": the exact filename from the list
- "reason": a short 1-sentence warning explaining the risk
If all files are completely safe (like normal source code), output an empty array [].
Output ONLY raw JSON. No markdown backticks.`;

  try {
    const response = await generateWithFallback({
      model: currentModel,
      contents: prompt,
    });
    let text = response.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (error) {
    // If the audit crashes (e.g. rate limit), fail open so we don't totally block the user's push
    return [];
  }
}

export async function auditStagingPayload(filesList, currentGitIgnore = '') {
  if (!aiClient) await ensureApiKey();
  // Pre-filter: strip items already covered by .gitignore so the AI never re-flags them
  const filteredList = filterAlreadyIgnored(filesList, currentGitIgnore);
  if (filteredList.length === 0) return [];
  
  const prompt = `You are a strict cybersecurity and Git project auditor. 
Review the following list of files and folders that are about to be staged (git add .) to the local repository.
Identify any files that are highly risky, heavily bloat the Git tree, or shouldn't be tracked natively. This includes:
- Secrets (.env, secure config files with credentials, API keys)
- Database chunks/caches (*.sqlite, *.db)
- Large dependencies/auto-builds (node_modules, dist, builds, coverage)
- Temporary IDE settings or local logs (.idea, .vscode, *.log)
- OS metadata files (.DS_Store, Thumbs.db)

Do NOT flag standard source code folders (src/), manifests (package.json), or mandatory binary entry points (bin/) as risky or bloat, as they are essential for the project's logic and publication.

File list:
${filteredList.join('\n')}

Current .gitignore contents (if already covered here, do NOT re-flag it):
${currentGitIgnore ? currentGitIgnore : '(empty)'}

Flag ONLY items that are physically present AND not already covered by .gitignore rules.
Output your findings as a strict JSON array of objects, where each object has:
- "file": the exact filename from the list
- "reason": a short 1-sentence warning explaining the risk
If all files are completely safe or already ignored, output an empty array [].
Output ONLY raw JSON. No markdown backticks.`;

  try {
    const response = await generateWithFallback({
      model: currentModel,
      contents: prompt,
    });
    let text = response.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (error) {
    return [];
  }
}

export async function auditCodebaseForIgnores(projectStructure, currentGitIgnore) {
  if (!aiClient) await ensureApiKey();
  // Pre-filter: remove items already matched by .gitignore patterns
  const filteredStructure = filterAlreadyIgnored(projectStructure, currentGitIgnore);
  if (filteredStructure.length === 0) return [];
  
  const prompt = `You are a strict Git repository auditor.
Review the following list of root-level files and folders physically present in a developer's local project directory.
You must absolutely flag any heavy dependency folders (like node_modules, vendor, dist), secret files (like .env, config.sh), database caches, or OS artifacts that should ideally NEVER be uploaded to GitHub. 

Physical Files/Folders in root directory:
${filteredStructure.join('\n')}

Current .gitignore contents:
${currentGitIgnore ? currentGitIgnore : '(empty)'}

Compare the physical files against the current .gitignore rules. 
If a dangerous or heavy file/folder physically exists but IS NOT fully covered by the .gitignore rules, flag it!
Do NOT flag things like standard source files (index.js, src/, package.json, README.md). 

Output your findings as a strict JSON array of objects, where each object has:
- "file": the exact filename or folder name from the physical list
- "reason": a short 1-sentence warning explaining the risk (e.g. "Contains GBs of packages", "Contains secrets")

If everything is perfectly safe or everything dangerous is already ignored, output [].
Output ONLY raw JSON. No markdown backticks.`;

  try {
    const response = await generateWithFallback({
      model: currentModel,
      contents: prompt,
    });
    let text = response.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (error) {
    return [];
  }
}
export async function summarizeCommandOutput(commands, output) {
  if (!aiClient) await ensureApiKey();
  const prompt = `You are a helpful Developer Assistant. The user just ran the following command(s):
${commands.map(c => `> ${c}`).join('\n')}

The combined output of these commands was:
${output}

Briefly explain what happened or what these results mean for the user. Be concise and friendly.`;

  try {
    const response = await generateWithFallback({
      model: currentModel,
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    return 'Could not generate summary of command output.';
  }
}

export async function generateOnboardingSummary(projectStructure, packageJsonContent) {
  if (!aiClient) await ensureApiKey();
  const prompt = `You are a senior engineer onboarding a new developer.
Based on the following directory structure and key configuration file (like package.json, etc.), explain the architecture of this project, its likely purpose, and where the developer should look first to understand the core logic.

Directory Structure:
${projectStructure.join('\n')}

Key Configuration File:
${packageJsonContent}

Provide a structured, helpful summary in markdown format. Be concise but informative.`;

  try {
    const response = await generateWithFallback({
      model: currentModel,
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    return 'Could not generate onboarding summary.';
  }
}
