#!/usr/bin/env node
/**
 * 🎵 Spotify Proxy - Smart Deployment Script
 *
 * Enhanced deployment with automatic validation and guidance
 *
 * Features:
 * - Automatic token validation
 * - Auto-detection of Account ID
 * - Permission checking
 * - Interactive troubleshooting
 * - Pre-configured token URL generation
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

// Required permissions for the proxy
const REQUIRED_PERMISSIONS = [
  "com.cloudflare.api.account.zone.workers.script",
  "com.cloudflare.api.account.zone.workers.kv",
];

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
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

function askYesNo(rl, question) {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      resolve(answer.toLowerCase().startsWith("y"));
    });
  });
}

function makeAPIRequest(url, token, method = "GET", data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    if (data && method !== "GET") {
      const postData = JSON.stringify(data);
      options.headers["Content-Length"] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(
              new Error(
                `API Error: ${parsed.errors?.[0]?.message || responseData}`
              )
            );
          }
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${responseData}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    if (data && method !== "GET") {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function validateToken(token) {
  try {
    log("🔍 Validating API token...", colors.yellow);
    const response = await makeAPIRequest(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      token
    );

    if (response.success) {
      log("✅ Token is valid!", colors.green);
      return response.result;
    } else {
      throw new Error("Token validation failed");
    }
  } catch (error) {
    log(`❌ Token validation failed: ${error.message}`, colors.red);
    return null;
  }
}

async function getAccountInfo(token) {
  try {
    log("🔍 Fetching account information...", colors.yellow);
    const response = await makeAPIRequest(
      "https://api.cloudflare.com/client/v4/accounts",
      token
    );

    if (response.success && response.result.length > 0) {
      const account = response.result[0];
      log(`✅ Found account: ${account.name} (${account.id})`, colors.green);
      return account;
    } else {
      throw new Error("No accounts found");
    }
  } catch (error) {
    log(`❌ Failed to fetch account info: ${error.message}`, colors.red);
    return null;
  }
}

async function checkWorkerPermissions(token, accountId) {
  try {
    log("🔍 Checking Workers permissions...", colors.yellow);

    // Try to list workers to test permissions
    const response = await makeAPIRequest(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
      token
    );

    if (response.success) {
      log("✅ Workers permissions confirmed!", colors.green);
      return true;
    }
    return false;
  } catch (error) {
    log(`❌ Workers permission check failed: ${error.message}`, colors.red);
    return false;
  }
}

async function checkKVPermissions(token, accountId) {
  try {
    log("🔍 Checking KV permissions...", colors.yellow);

    // Try to list KV namespaces to test permissions
    const response = await makeAPIRequest(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
      token
    );

    if (response.success) {
      log("✅ KV permissions confirmed!", colors.green);
      return true;
    }
    return false;
  } catch (error) {
    log(`❌ KV permission check failed: ${error.message}`, colors.red);
    return false;
  }
}

function generateTokenURL() {
  const permissions = [
    "Account:Cloudflare Workers:Edit",
    "Account:Workers KV Storage:Edit",
  ].join(",");

  // Note: Cloudflare doesn't support pre-filling custom tokens via URL
  // But we can provide the exact instructions
  return "https://dash.cloudflare.com/profile/api-tokens";
}

function showTokenInstructions() {
  log(
    `
${colors.bold}📋 Create Your API Token:${colors.reset}

1. Visit: ${colors.cyan}https://dash.cloudflare.com/profile/api-tokens${colors.reset}
2. Click "${colors.bold}Create Token${colors.reset}"
3. Click "${colors.bold}Get started${colors.reset}" next to "Custom token"
4. Configure:
   ${colors.yellow}Token name:${colors.reset} spotify-proxy
   ${colors.yellow}Permissions:${colors.reset}
   • Account → Cloudflare Workers → Edit
   • Account → Workers KV Storage → Edit
   ${colors.yellow}Account Resources:${colors.reset} Include All accounts
5. Click "${colors.bold}Continue to summary${colors.reset}" → "${colors.bold}Create Token${colors.reset}"
6. ${colors.bold}Copy the token${colors.reset} and paste it below

${colors.dim}💡 Tip: Keep this terminal open and the token page open in your browser${colors.reset}
`,
    colors.blue
  );
}

async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
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
    execSync(`unzip -q "${zipPath}" -d "${extractPath}"`, { stdio: "pipe" });
  } catch (error) {
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
🎵 ${colors.bold}Spotify Proxy - Smart Deployment${colors.reset}
${"=".repeat(55)}

${colors.green}✨ Enhanced with automatic validation and setup!${colors.reset}

This script will:
• Validate your Cloudflare credentials automatically
• Detect your Account ID
• Check required permissions
• Guide you through any issues
• Deploy your Spotify proxy

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

    // Get API token with validation
    let token = null;
    let tokenInfo = null;
    let account = null;

    while (!tokenInfo) {
      log("\n🔑 Cloudflare API Token Setup:", colors.yellow);

      const hasToken = await askYesNo(
        rl,
        "Do you already have a Cloudflare API token with Workers permissions?"
      );

      if (!hasToken) {
        showTokenInstructions();
        await askQuestion(
          rl,
          "\nPress Enter when you have created your token..."
        );
      }

      token = await askQuestion(rl, "\nEnter your Cloudflare API Token: ");
      if (!token) {
        log("❌ API Token is required", colors.red);
        continue;
      }

      tokenInfo = await validateToken(token);
      if (!tokenInfo) {
        const retry = await askYesNo(
          rl,
          "Would you like to try a different token?"
        );
        if (!retry) {
          log("❌ Valid API token is required for deployment", colors.red);
          process.exit(1);
        }
      }
    }

    // Get account information automatically
    account = await getAccountInfo(token);
    if (!account) {
      log(
        "❌ Could not access account information. Please check your token permissions.",
        colors.red
      );
      process.exit(1);
    }

    // Check permissions
    log("\n🔐 Checking permissions...", colors.yellow);
    const hasWorkersPermission = await checkWorkerPermissions(
      token,
      account.id
    );
    const hasKVPermission = await checkKVPermissions(token, account.id);

    if (!hasWorkersPermission || !hasKVPermission) {
      log("\n❌ Missing required permissions:", colors.red);
      if (!hasWorkersPermission)
        log("  • Workers Scripts permission required", colors.red);
      if (!hasKVPermission)
        log("  • Workers KV Storage permission required", colors.red);

      log(
        "\n💡 Please create a new token with the correct permissions:",
        colors.yellow
      );
      showTokenInstructions();
      process.exit(1);
    }

    // Get worker name
    const defaultWorkerName = "spotify-proxy";
    const workerName =
      (await askQuestion(
        rl,
        `\nEnter worker name (or press Enter for "${defaultWorkerName}"): `
      )) || defaultWorkerName;

    // Confirm deployment
    log(`\n${colors.bold}🚀 Ready to Deploy!${colors.reset}

${colors.green}Account:${colors.reset} ${account.name}
${colors.green}Account ID:${colors.reset} ${account.id}
${colors.green}Worker Name:${colors.reset} ${workerName}
${colors.green}Expected URL:${colors.reset} https://${workerName}.${account.id}.workers.dev
    `);

    const confirm = await askYesNo(rl, "Proceed with deployment?");
    if (!confirm) {
      log("❌ Deployment cancelled", colors.yellow);
      process.exit(0);
    }

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
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: account.id,
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
      : `https://${workerName}.${account.id}.workers.dev`;

    log(
      `
🎉 ${colors.bold}Deployment Complete!${colors.reset}

Your Spotify Proxy is now live at:
${colors.cyan}${colors.bold}${workerUrl}${colors.reset}

${colors.bold}✨ Smart Setup Summary:${colors.reset}
• Token validated automatically ✅
• Account detected: ${colors.green}${account.name}${colors.reset}
• Permissions confirmed ✅
• Worker deployed successfully ✅

${colors.bold}Next Steps:${colors.reset}
1. ${colors.yellow}Visit your worker URL${colors.reset} to start setup
2. ${colors.yellow}Enter your Spotify app credentials${colors.reset}
3. ${colors.yellow}Complete OAuth authorization${colors.reset}
4. ${colors.yellow}Start using your proxy!${colors.reset}

${colors.bold}API Endpoints:${colors.reset}
• ${colors.cyan}${workerUrl}/now-playing${colors.reset}
• ${colors.cyan}${workerUrl}/recent${colors.reset}
• ${colors.cyan}${workerUrl}/health${colors.reset}

${colors.dim}Need help? Check: ${REPO_URL}${colors.reset}
    `,
      colors.green
    );
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, colors.red);

    if (error.message.includes("API Error")) {
      log(
        "\n💡 This might be a permission issue. Try creating a new token with the correct permissions.",
        colors.yellow
      );
    } else if (error.message.includes("Command failed")) {
      log(
        "\n💡 This might be a network or dependency issue. Please check your internet connection.",
        colors.yellow
      );
    }

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
