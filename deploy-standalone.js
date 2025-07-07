#!/usr/bin/env node
/**
 * 🎵 Spotify Proxy - Standalone Deployment Script
 *
 * This script allows you to deploy the Spotify proxy directly to Cloudflare Workers
 * without needing a GitHub account or cloning any repositories.
 *
 * Usage: node deploy-standalone.js
 *
 * Requirements:
 * - Node.js 18+ installed
 * - Cloudflare account with API token
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");
const https = require("https");

// Configuration
const REPO_URL = "https://github.com/abersager/spotify-proxy";
const TEMP_DIR = path.join(__dirname, "spotify-proxy-temp");
const ARCHIVE_URL =
  "https://github.com/abersager/spotify-proxy/archive/refs/heads/main.zip";

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          return downloadFile(response.headers.location, destination);
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(destination, () => {});
        reject(err);
      });
  });
}

function extractZip(zipPath, extractPath) {
  try {
    // Try using built-in unzip
    execSync(`unzip -q "${zipPath}" -d "${extractPath}"`, { stdio: "pipe" });
  } catch (error) {
    // Fallback to other extraction methods
    try {
      execSync(`7z x "${zipPath}" -o"${extractPath}"`, { stdio: "pipe" });
    } catch (error2) {
      throw new Error(
        "Could not extract zip file. Please install unzip or 7z."
      );
    }
  }
}

function runCommand(command, cwd = process.cwd()) {
  try {
    return execSync(command, { cwd, stdio: "pipe" }).toString().trim();
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
}

function cleanup() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}

async function main() {
  log(
    `
🎵 ${colors.bold}Spotify Proxy - Standalone Deployment${colors.reset}
${"=".repeat(50)}

This script will deploy a Spotify proxy to your Cloudflare Workers account.
You'll need:
- A Cloudflare account (free tier works)
- Cloudflare API token with Workers:Edit permissions
- Your Cloudflare Account ID

Let's get started!
`,
    colors.cyan
  );

  const rl = createInterface();

  try {
    // Check prerequisites
    log("\n📋 Checking prerequisites...", colors.yellow);

    try {
      runCommand("node --version");
      log("✅ Node.js is installed");
    } catch (error) {
      log(
        "❌ Node.js is required. Please install Node.js 18+ and try again.",
        colors.red
      );
      process.exit(1);
    }

    // Get Cloudflare credentials
    log("\n🔑 Cloudflare Configuration:", colors.yellow);
    log(
      "Get your credentials from: https://dash.cloudflare.com/profile/api-tokens"
    );
    log("Account ID: https://dash.cloudflare.com (right sidebar)\n");

    const apiToken = await askQuestion(rl, "Enter your Cloudflare API Token: ");
    if (!apiToken) {
      log("❌ API Token is required", colors.red);
      process.exit(1);
    }

    const accountId = await askQuestion(
      rl,
      "Enter your Cloudflare Account ID: "
    );
    if (!accountId) {
      log("❌ Account ID is required", colors.red);
      process.exit(1);
    }

    const workerName =
      (await askQuestion(
        rl,
        'Enter worker name (or press Enter for "spotify-proxy"): '
      )) || "spotify-proxy";

    // Download and extract source code
    log("\n📥 Downloading source code...", colors.yellow);
    const zipPath = path.join(__dirname, "spotify-proxy.zip");

    await downloadFile(ARCHIVE_URL, zipPath);
    log("✅ Source code downloaded");

    // Extract
    log("📦 Extracting files...", colors.yellow);
    extractZip(zipPath, TEMP_DIR);

    // Find the extracted directory
    const extractedDir = fs
      .readdirSync(TEMP_DIR)
      .find((dir) => fs.statSync(path.join(TEMP_DIR, dir)).isDirectory());

    if (!extractedDir) {
      throw new Error("Could not find extracted directory");
    }

    const projectDir = path.join(TEMP_DIR, extractedDir);
    log("✅ Files extracted");

    // Install dependencies
    log("\n📦 Installing dependencies...", colors.yellow);
    runCommand("npm ci", projectDir);
    log("✅ Dependencies installed");

    // Update worker name in wrangler.toml
    const wranglerPath = path.join(projectDir, "wrangler.toml");
    let wranglerContent = fs.readFileSync(wranglerPath, "utf8");
    wranglerContent = wranglerContent.replace(
      /name = "spotify-proxy"/,
      `name = "${workerName}"`
    );
    fs.writeFileSync(wranglerPath, wranglerContent);
    log(`✅ Worker name set to: ${workerName}`);

    // Deploy to Cloudflare
    log("\n🚀 Deploying to Cloudflare Workers...", colors.yellow);

    const env = {
      ...process.env,
      CLOUDFLARE_API_TOKEN: apiToken,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    };

    const deployCommand = "npx wrangler deploy";
    const deployOutput = execSync(deployCommand, {
      cwd: projectDir,
      env,
      stdio: "pipe",
    }).toString();

    log("✅ Deployment successful!", colors.green);

    // Extract worker URL from output
    const urlMatch = deployOutput.match(/https:\/\/[^\s]+/);
    const workerUrl = urlMatch
      ? urlMatch[0]
      : `https://${workerName}.${accountId}.workers.dev`;

    log(
      `
🎉 ${colors.bold}Deployment Complete!${colors.reset}

Your Spotify Proxy is now live at:
${colors.cyan}${workerUrl}${colors.reset}

${colors.bold}Next Steps:${colors.reset}
1. Visit your worker URL to start setup
2. Enter your Spotify app credentials
3. Complete OAuth authorization
4. Start using your proxy!

${colors.bold}API Endpoints:${colors.reset}
• ${workerUrl}/now-playing
• ${workerUrl}/recent
• ${workerUrl}/health

${colors.yellow}Need help?${colors.reset} Check the README: ${REPO_URL}
    `,
      colors.green
    );
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, colors.red);
    process.exit(1);
  } finally {
    rl.close();
    cleanup();

    // Clean up zip file
    const zipPath = path.join(__dirname, "spotify-proxy.zip");
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
  }
}

// Handle cleanup on exit
process.on("SIGINT", () => {
  log("\n\n🛑 Deployment cancelled", colors.yellow);
  cleanup();
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  log(`\n❌ Unexpected error: ${error.message}`, colors.red);
  cleanup();
  process.exit(1);
});

if (require.main === module) {
  main();
}
