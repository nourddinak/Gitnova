import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import boxen from 'boxen';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function checkUpdate() {
  try {
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    const packageJsonStr = fs.readFileSync(packageJsonPath, 'utf8');
    const packageData = JSON.parse(packageJsonStr);
    const currentVersion = packageData.version;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch('https://registry.npmjs.org/gitnova/latest', {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const latestVersion = data.version;

    if (currentVersion && latestVersion && currentVersion !== latestVersion) {
      const currentParts = currentVersion.split('.').map(Number);
      const latestParts = latestVersion.split('.').map(Number);
      let isNewer = false;
      for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const latestPart = latestParts[i] || 0;
        const currentPart = currentParts[i] || 0;
        if (latestPart > currentPart) {
          isNewer = true;
          break;
        } else if (latestPart < currentPart) {
          break;
        }
      }

      if (isNewer) {
        const message = `Update available! ${chalk.red(currentVersion)} → ${chalk.green(latestVersion)}\nRun ${chalk.cyan('npm i -g gitnova@latest')} to update.`;
        console.log(boxen(message, {
          padding: 1,
          margin: 1,
          align: 'center',
          borderColor: 'yellow',
          borderStyle: 'round'
        }));
      }
    }
  } catch (error) {
    // Fail gracefully on timeout or other errors
  }
}

/**
 * Shows the "What's New" changelog panel the first time the user runs
 * a new version of GitNova. After displaying, marks the version as seen
 * in ~/.gitnova-config.json so it never shows again until the next update.
 */
export function showChangelog() {
  try {
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    const currentVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
    if (!currentVersion) return;

    const configPath = path.join(os.homedir(), '.gitnova-config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
    }

    // Already shown for this version — skip
    if (config.lastSeenVersion === currentVersion) return;

    // Load CHANGELOG.json
    const changelogPath = path.join(__dirname, '..', '..', 'CHANGELOG.json');
    if (!fs.existsSync(changelogPath)) return;

    let changelog = {};
    try { changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf8')); } catch (e) { return; }

    const entry = changelog[currentVersion];
    if (!entry || !Array.isArray(entry.notes) || entry.notes.length === 0) {
      // No notes for this version — still mark as seen so we don't keep checking
      config.lastSeenVersion = currentVersion;
      fs.writeFileSync(configPath, JSON.stringify(config));
      return;
    }

    // Build and display the panel
    const title = entry.title || `What's New in v${currentVersion}`;
    const body = chalk.bold(title) + '\n\n' + entry.notes.map(n => `  ${n}`).join('\n');

    console.log(boxen(body, {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 1, right: 1 },
      borderStyle: 'double',
      borderColor: 'magentaBright',
      title: "🎉 What's New",
      titleAlignment: 'center'
    }));

    // Mark as seen
    config.lastSeenVersion = currentVersion;
    fs.writeFileSync(configPath, JSON.stringify(config));
  } catch (e) {
    // Never crash startup due to changelog issues
  }
}


/**
 * Fetches the last-month download count for gitnova from the npm downloads API.
 * Returns the count as a number, or null on failure. Never throws.
 */
export async function getNpmDownloads() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('https://api.npmjs.org/downloads/point/last-month/gitnova', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.downloads === 'number' ? data.downloads : null;
  } catch (e) {
    return null;
  }
}

/**
 * Fetches notices.json from the live GitHub repo and displays any active
 * notice the user hasn't seen yet. Seen notice IDs are stored in
 * ~/.gitnova-config.json so each notice only ever shows once per user.
 *
 * To push a message to all users: edit notices.json and commit to GitHub.
 * Set notice to null to clear it. No npm publish required.
 *
 * Notice format:
 * {
 *   "notice": {
 *     "id": "unique-id-for-this-message",
 *     "type": "info" | "warning" | "critical",
 *     "message": "Your message here",
 *     "expires": "2025-12-31"  // optional ISO date — notice is hidden after this
 *   }
 * }
 */
export async function fetchNotice() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(
      'https://raw.githubusercontent.com/nourddinak/GitNova/main/notices.json',
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!res.ok) return;

    const data = await res.json();
    const notice = data.notice;

    // No active notice
    if (!notice || !notice.id || !notice.message) return;

    // Check expiry
    if (notice.expires) {
      const expiry = new Date(notice.expires);
      if (!isNaN(expiry.getTime()) && new Date() > expiry) return;
    }

    // Check if already seen
    const configPath = path.join(os.homedir(), '.gitnova-config.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
    }

    const seenNotices = Array.isArray(config.seenNotices) ? config.seenNotices : [];
    if (seenNotices.includes(notice.id)) return;

    // Pick border colour by type
    const borderColorMap = { warning: 'yellow', critical: 'red', info: 'cyan' };
    const borderColor = borderColorMap[notice.type] || 'cyan';
    const titleMap = { warning: '⚠️  Notice', critical: '🚨 Important', info: 'ℹ️  Notice' };
    const title = titleMap[notice.type] || 'ℹ️  Notice';

    console.log(boxen(notice.message, {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor,
      title,
      titleAlignment: 'center'
    }));

    // Mark as seen
    seenNotices.push(notice.id);
    config.seenNotices = seenNotices;
    fs.writeFileSync(configPath, JSON.stringify(config));
  } catch (e) {
    // Never crash startup due to notice fetch issues
  }
}

