# GitNova: AI-Powered Git & GitHub CLI

**GitNova** is a high-performance, interactive CLI tool designed to streamline your Git and GitHub workflows using the power of advanced AI models (Gemini, DeepSeek, Groq). It transforms complex Git operations into a conversational experience, providing intelligent automation, security auditing, and guided repository management.

---

## ✨ Features Overview

- **🗣️ Natural Language Git**: Command your repository using plain English. Type "sync my changes" or "create a new branch called feature-x" and let the AI handle the rest.
- **🚀 AI Auto Mode**: Use `gitnova --auto` to automatically stage, generate a commit message, and push your changes in one go, complete with security safeguards.
- **📝 AI Commit Messages**: Automatically analyze staged diffs and generate concise, professional commit messages.
- **🛡️ Security & Bloat Guard**: 
    - **Staging Audit**: Proactive AI scanning of file payloads before staging to prevent accidental leaks of credentials or binary bloat.
    - **Push Safeguard**: Scans unpushed commits for sensitive data before they hit the remote.
    - **Codebase Scan**: `/ignore ai_scan` finds missing `.gitignore` rules in your entire project.
- **🩹 AI Auto-Healing**: When Git commands fail (e.g., merge conflicts, detached HEAD), GitNova explains the error and proposes actionable solutions.
- **🔗 Seamless GitHub Integration**: Automatically detects missing remotes and guides you through linking existing repos or creating new ones via the GitHub CLI (`gh`).
- **🤖 Multi-Provider Flexibility**: Support for **Google Gemini**, **DeepSeek**, and **Groq** to balance speed and reasoning depth.
- **🧭 Repository Onboarding**: `/onboard` provides an AI-generated architectural summary and feature overview of any repository.

---

## 🛠️ Tech Stack

- **Core**: Node.js (ES Modules)
- **AI Engines**: [Google Gemini](https://ai.google.dev/), [DeepSeek](https://www.deepseek.com/), [Groq](https://groq.com/)
- **CLI Framework**: Commander.js & Inquirer.js
- **Git Integration**: Simple-Git & GitHub CLI (`gh`)
- **Styling**: Boxen, Chalk, Ora (Spinners), Gradient-String

  **Install Globally**
   ```bash
   npm install -g gitnova
---


## 🚀 Installation Instructions

### Prerequisites
1. **Node.js**: Version 18 or higher.
2. **Windows OS**: GitNova is currently optimized and validated for Windows.
3. **Git & GitHub CLI**: Recommended for full functionality. GitNova will offer to install these for you on Windows if they are missing.

### Step-by-Step Setup
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/nourddinak/Gitnova.git
   cd Gitnova
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

---

## 📖 Usage Guide

### Starting GitNova
Launch the interactive assistant:
```bash
gitnova
# OR
npm start
```

### ⚡ Auto Mode
For near-instant synchronization, use the `--auto` flag:
```bash
gitnova --auto
# OR with a custom message:
gitnova --auto "feat: finalize documentation"
```
*Auto Mode provides AI-generated commit messages and security scanning by default.*

### Conversational Commands
Once initialized, you can type commands like:
- `status` - View current repository state.
- `commit my work` - Stages changes and generates an AI commit message.
- `sync with origin` - Performs a safe pull followed by a push.
- `switch to main` - Changes your current branch.
- `explain this error` - If a command fails, ask for an AI explanation.

### Slash Commands
Access specialized tools and configuration by typing `/` in the prompt:
- `/onboard`: Get an AI-generated project overview and architectural summary.
- `/info`: View detailed repository and GitHub status.
- `/settings`: Configure Auto Mode behavior (Ask, Auto-Ignore, Notify).
- `/provider`: Switch between Gemini, DeepSeek, and Groq.
- `/model`: Switch between specific AI models.
- `/ignore`: Access advanced AI-driven `.gitignore` management.
- `/key`: Update your API key.
- `/clear`: Clear the terminal screen.
- `/help`: Display the full help menu.

---

## 📂 Project Structure

```text
Gitnova/
├── bin/
│   └── gitnova.js       # CLI Entry point
├── src/
│   ├── index.js         # Main orchestrator & Onboarding
│   ├── chat/
│   │   └── session.js   # Interactive REPL & Auto Mode logic
│   └── utils/
│       ├── ai.js        # Multi-provider AI & Prompt engineering
│       ├── git.js       # Simple-Git integration
│       ├── github.js    # GitHub CLI (gh) integration
│       └── system.js    # Environment checks & Auto-installers
└── package.json         # Dependencies & project metadata
```

---

## 🤝 Contribution Guidelines

Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).

---
Developed with ❤️ by **[nourddinak](https://github.com/nourddinak)**
