import fs from 'fs';
import path from 'path';
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
