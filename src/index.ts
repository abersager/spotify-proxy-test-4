/**
 * Spotify Proxy - Cloudflare Worker
 *
 * A personal Spotify API proxy that handles OAuth authentication
 * and provides simple endpoints for accessing Spotify data.
 */

export interface Env {
  SPOTIFY_DATA: KVNamespace;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  ENVIRONMENT: string;
}

// CORS headers for all responses
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handling
      switch (pathname) {
        case "/":
          return handleRoot(request, env);
        case "/setup":
          return handleSetup(request, env);
        case "/credentials":
          return handleCredentials(request, env);
        case "/callback":
          return handleCallback(request, env);
        case "/now-playing":
          return handleNowPlaying(request, env);
        case "/recent":
          return handleRecent(request, env);
        case "/health":
          return handleHealth(request, env);
        default:
          return new Response("Not Found", {
            status: 404,
            headers: corsHeaders,
          });
      }
    } catch (error) {
      console.error("Error handling request:", error);
      return new Response("Internal Server Error", {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};

/**
 * Handle root endpoint - redirect to setup
 */
async function handleRoot(request: Request, env: Env): Promise<Response> {
  const storedCredentials = await getStoredCredentials(env);
  const storedTokens = await getStoredTokens(env);

  let setupStatus = "not_started";
  let nextAction = "/credentials";
  let nextActionText = "Setup Credentials";

  if (storedCredentials) {
    if (storedTokens) {
      setupStatus = "complete";
      nextAction = "/now-playing";
      nextActionText = "View Now Playing";
    } else {
      setupStatus = "credentials_only";
      nextAction = "/setup";
      nextActionText = "Connect Spotify Account";
    }
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Spotify Proxy</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          text-align: center;
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background: #1db954;
          color: white;
          text-decoration: none;
          border-radius: 25px;
          margin: 10px;
          font-size: 16px;
        }
        .button:hover { background: #1ed760; }
        .button.secondary {
          background: #666;
          font-size: 14px;
          padding: 8px 16px;
        }
        .button.secondary:hover { background: #888; }
        .status {
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
        }
        .status.complete { background: #e8f5e8; color: #2e7d32; }
        .status.partial { background: #fff3e0; color: #f57c00; }
        .status.pending { background: #e3f2fd; color: #1976d2; }
        .endpoints {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 10px;
          margin: 20px 0;
        }
        .endpoint {
          padding: 10px;
          background: #f9f9f9;
          border-radius: 5px;
          text-align: left;
        }
        .endpoint a {
          color: #1db954;
          text-decoration: none;
          font-weight: bold;
        }
        .endpoint a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎵 Spotify Proxy</h1>
        <p>Your personal Spotify API proxy</p>

        ${
          setupStatus === "complete"
            ? `
          <div class="status complete">
            ✅ <strong>Setup Complete!</strong><br>
            Your Spotify account is connected and ready to use.
          </div>
        `
            : setupStatus === "credentials_only"
            ? `
          <div class="status partial">
            ⚠️ <strong>Credentials Set, OAuth Pending</strong><br>
            Connect your Spotify account to start using the proxy.
          </div>
        `
            : `
          <div class="status pending">
            🔧 <strong>Setup Required</strong><br>
            Enter your Spotify app credentials to get started.
          </div>
        `
        }

        <div>
          <a href="${nextAction}" class="button">${nextActionText}</a>
          <a href="/health" class="button secondary">Health Check</a>
        </div>

        ${
          setupStatus === "complete"
            ? `
          <div class="endpoints">
            <div class="endpoint">
              <a href="/now-playing">/now-playing</a>
              <div>Current track & playback</div>
            </div>
            <div class="endpoint">
              <a href="/recent">/recent</a>
              <div>Recently played tracks</div>
            </div>
            <div class="endpoint">
              <a href="/health">/health</a>
              <div>API status & health</div>
            </div>
          </div>
        `
            : ""
        }

        ${
          setupStatus !== "not_started"
            ? `
          <div style="margin-top: 20px;">
            <a href="/credentials" class="button secondary">Update Credentials</a>
          </div>
        `
            : ""
        }
      </div>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      ...corsHeaders,
    },
  });
}

/**
 * Handle setup endpoint - OAuth configuration
 */
async function handleSetup(request: Request, env: Env): Promise<Response> {
  // Check if we have stored credentials
  const storedCredentials = await getStoredCredentials(env);

  if (!storedCredentials) {
    // No credentials stored, redirect to credentials page
    return Response.redirect(
      new URL("/credentials", request.url).toString(),
      302
    );
  }

  // If POST request, handle OAuth initiation
  if (request.method === "POST") {
    const redirectUri = `${new URL(request.url).origin}/callback`;
    const scope =
      "user-read-currently-playing user-read-recently-played user-read-playback-state";
    const state = generateRandomString(16);

    // Store state in KV for verification
    await env.SPOTIFY_DATA.put(`oauth_state_${state}`, "pending", {
      expirationTtl: 600,
    });

    const authUrl =
      `https://accounts.spotify.com/authorize?` +
      `response_type=code&` +
      `client_id=${storedCredentials.client_id}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;

    return Response.redirect(authUrl, 302);
  }

  // Return setup HTML
  const html = await getSetupHTML();
  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      ...corsHeaders,
    },
  });
}

/**
 * Handle credentials endpoint - Store Spotify app credentials
 */
async function handleCredentials(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "POST") {
    try {
      const formData = await request.formData();
      const clientId = formData.get("client_id") as string;
      const clientSecret = formData.get("client_secret") as string;

      // Validate credentials
      if (!clientId || !clientSecret) {
        return new Response(
          await getCredentialsHTML(
            "Please provide both Client ID and Client Secret",
            request.url
          ),
          {
            status: 400,
            headers: {
              "Content-Type": "text/html",
              ...corsHeaders,
            },
          }
        );
      }

      // Basic validation for Spotify Client ID format
      if (clientId.length < 30 || !clientId.match(/^[a-zA-Z0-9]+$/)) {
        return new Response(
          await getCredentialsHTML(
            "Invalid Client ID format. Please check your Spotify app credentials.",
            request.url
          ),
          {
            status: 400,
            headers: {
              "Content-Type": "text/html",
              ...corsHeaders,
            },
          }
        );
      }

      // Store credentials in KV
      const credentials = {
        client_id: clientId,
        client_secret: clientSecret,
        created_at: new Date().toISOString(),
      };

      await env.SPOTIFY_DATA.put(
        "spotify_credentials",
        JSON.stringify(credentials)
      );

      // Redirect to setup page
      return Response.redirect(new URL("/setup", request.url).toString(), 302);
    } catch (error) {
      return new Response(
        await getCredentialsHTML(
          "Error processing credentials. Please try again.",
          request.url
        ),
        {
          status: 500,
          headers: {
            "Content-Type": "text/html",
            ...corsHeaders,
          },
        }
      );
    }
  }

  // GET request - show credentials form
  const html = await getCredentialsHTML(undefined, request.url);
  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      ...corsHeaders,
    },
  });
}

/**
 * Handle OAuth callback
 */
async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`OAuth Error: ${error}`, { status: 400 });
  }

  if (!code || !state) {
    return new Response("Missing authorization code or state", { status: 400 });
  }

  // Verify state
  const storedState = await env.SPOTIFY_DATA.get(`oauth_state_${state}`);
  if (!storedState) {
    return new Response("Invalid or expired state parameter", { status: 400 });
  }

  // Exchange code for tokens
  const tokenResponse = await exchangeCodeForTokens(code, request.url, env);
  if (!tokenResponse.success) {
    return new Response(`Token exchange failed: ${tokenResponse.error}`, {
      status: 400,
    });
  }

  // Store tokens in KV
  await env.SPOTIFY_DATA.put(
    "spotify_tokens",
    JSON.stringify(tokenResponse.data),
    { expirationTtl: 3600 }
  );

  // Clean up state
  await env.SPOTIFY_DATA.delete(`oauth_state_${state}`);

  return new Response(
    `
    <html>
      <head><title>OAuth Success</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>✅ OAuth Setup Complete!</h1>
        <p>Your Spotify account has been successfully connected.</p>
        <p>You can now use the API endpoints:</p>
        <ul style="display: inline-block; text-align: left;">
          <li><a href="/now-playing">/now-playing</a></li>
          <li><a href="/recent">/recent</a></li>
          <li><a href="/health">/health</a></li>
        </ul>
        <p><a href="/">&larr; Back to Home</a></p>
      </body>
    </html>
  `,
    {
      headers: {
        "Content-Type": "text/html",
        ...corsHeaders,
      },
    }
  );
}

/**
 * Handle now-playing endpoint
 */
async function handleNowPlaying(request: Request, env: Env): Promise<Response> {
  const tokens = await getStoredTokens(env);
  if (!tokens) {
    return new Response(
      JSON.stringify({
        error: "No valid tokens found. Please complete OAuth setup first.",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  const spotifyResponse = await callSpotifyAPI(
    "/v1/me/player/currently-playing",
    tokens.access_token
  );

  if (spotifyResponse.status === 204) {
    return new Response(
      JSON.stringify({ playing: false, message: "No track currently playing" }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  if (!spotifyResponse.ok) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch current track" }),
      {
        status: spotifyResponse.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  const data = await spotifyResponse.json();
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

/**
 * Handle recent tracks endpoint
 */
async function handleRecent(request: Request, env: Env): Promise<Response> {
  const tokens = await getStoredTokens(env);
  if (!tokens) {
    return new Response(
      JSON.stringify({
        error: "No valid tokens found. Please complete OAuth setup first.",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  const spotifyResponse = await callSpotifyAPI(
    "/v1/me/player/recently-played?limit=10",
    tokens.access_token
  );

  if (!spotifyResponse.ok) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch recent tracks" }),
      {
        status: spotifyResponse.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  const data = await spotifyResponse.json();
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

/**
 * Handle health check endpoint
 */
async function handleHealth(request: Request, env: Env): Promise<Response> {
  const credentials = await getStoredCredentials(env);
  const tokens = await getStoredTokens(env);
  const hasValidCredentials = credentials !== null;
  const hasValidTokens = tokens !== null;

  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || "unknown",
    credentials_configured: hasValidCredentials,
    oauth_configured: hasValidTokens,
    setup_complete: hasValidCredentials && hasValidTokens,
    next_step: !hasValidCredentials
      ? "Configure Spotify credentials at /credentials"
      : !hasValidTokens
      ? "Complete OAuth setup at /setup"
      : "Ready to use API endpoints",
    endpoints: {
      home: "/",
      credentials: "/credentials",
      setup: "/setup",
      callback: "/callback",
      now_playing: "/now-playing",
      recent: "/recent",
      health: "/health",
    },
  };

  return new Response(JSON.stringify(health, null, 2), {
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

/**
 * Utility Functions
 */

function generateRandomString(length: number): string {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

async function exchangeCodeForTokens(
  code: string,
  callbackUrl: string,
  env: Env
) {
  const redirectUri = new URL(callbackUrl).origin + "/callback";
  const credentials = await getStoredCredentials(env);

  if (!credentials) {
    return {
      success: false,
      error: "No Spotify credentials found. Please complete setup first.",
    };
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(
        `${credentials.client_id}:${credentials.client_secret}`
      )}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      error: `Token exchange failed: ${response.statusText}`,
    };
  }

  const data = await response.json();
  return { success: true, data };
}

async function getStoredCredentials(env: Env) {
  const credentialsJson = await env.SPOTIFY_DATA.get("spotify_credentials");
  return credentialsJson ? JSON.parse(credentialsJson) : null;
}

async function getStoredTokens(env: Env) {
  const tokensJson = await env.SPOTIFY_DATA.get("spotify_tokens");
  return tokensJson ? JSON.parse(tokensJson) : null;
}

async function callSpotifyAPI(endpoint: string, accessToken: string) {
  return fetch(`https://api.spotify.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

async function getSetupHTML(): Promise<string> {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Spotify Proxy Setup</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background: #1db954;
          color: white;
          text-decoration: none;
          border-radius: 25px;
          margin: 10px 0;
          border: none;
          cursor: pointer;
          font-size: 16px;
        }
        .button:hover { background: #1ed760; }
        .button.secondary {
          background: #666;
          font-size: 14px;
          padding: 8px 16px;
        }
        .button.secondary:hover { background: #888; }
        .info {
          background: #e8f5e8;
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
        }
        .step {
          margin: 15px 0;
          padding: 10px;
          background: #f9f9f9;
          border-left: 4px solid #1db954;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎵 Spotify Proxy Setup</h1>

        <div class="info">
          <h3>✅ Credentials Configured</h3>
          <p>Your Spotify app credentials are ready. Now connect your account!</p>
        </div>

        <div class="step">
          <h3>Step 1: Authorize with Spotify</h3>
          <p>Click the button below to connect your Spotify account:</p>
          <form method="POST">
            <button type="submit" class="button">🔗 Connect Spotify Account</button>
          </form>
        </div>

        <div class="step">
          <h3>Step 2: Test Your Setup</h3>
          <p>After authorization, test these endpoints:</p>
          <ul>
            <li><a href="/now-playing">/now-playing</a> - Current track</li>
            <li><a href="/recent">/recent</a> - Recent tracks</li>
            <li><a href="/health">/health</a> - Health check</li>
          </ul>
        </div>

        <p>
          <a href="/">&larr; Back to Home</a> |
          <a href="/credentials" class="button secondary">Update Credentials</a>
        </p>
      </div>
    </body>
    </html>
  `;
}

async function getCredentialsHTML(
  errorMessage?: string,
  requestUrl?: string
): Promise<string> {
  const origin = requestUrl
    ? new URL(requestUrl).origin
    : "https://your-worker.workers.dev";
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Spotify Proxy - Credentials</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background: #1db954;
          color: white;
          text-decoration: none;
          border-radius: 25px;
          margin: 10px 0;
          border: none;
          cursor: pointer;
          font-size: 16px;
          width: 100%;
        }
        .button:hover { background: #1ed760; }
        .form-group {
          margin: 20px 0;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        .form-group input {
          width: 100%;
          padding: 10px;
          border: 2px solid #ddd;
          border-radius: 5px;
          font-size: 14px;
          box-sizing: border-box;
        }
        .form-group input:focus {
          border-color: #1db954;
          outline: none;
        }
        .error {
          background: #ffebee;
          color: #c62828;
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
        }
        .info {
          background: #e3f2fd;
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
        }
        .step {
          margin: 15px 0;
          padding: 10px;
          background: #f9f9f9;
          border-left: 4px solid #1db954;
        }
        code {
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎵 Spotify App Credentials</h1>

        ${errorMessage ? `<div class="error">❌ ${errorMessage}</div>` : ""}

        <div class="info">
          <h3>Setup Instructions:</h3>
          <ol>
            <li>Go to <a href="https://developer.spotify.com/dashboard" target="_blank">Spotify Developer Dashboard</a></li>
            <li>Create a new app (or use existing)</li>
            <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong></li>
                        <li>Add this callback URL: <code>${origin}/callback</code></li>
            <li>Enter your credentials below</li>
          </ol>
        </div>

        <form method="POST">
          <div class="form-group">
            <label for="client_id">Spotify Client ID:</label>
            <input
              type="text"
              id="client_id"
              name="client_id"
              placeholder="e.g., 1234567890abcdef1234567890abcdef"
              required
            />
          </div>

          <div class="form-group">
            <label for="client_secret">Spotify Client Secret:</label>
            <input
              type="password"
              id="client_secret"
              name="client_secret"
              placeholder="Your app's client secret"
              required
            />
          </div>

          <button type="submit" class="button">💾 Save Credentials</button>
        </form>

        <div class="step">
          <h3>⚠️ Security Note</h3>
          <p>Your credentials are stored securely in Cloudflare KV and are only used to authenticate with Spotify's API. They are not shared with any third parties.</p>
        </div>

        <p><a href="/">&larr; Back to Home</a></p>
      </div>
    </body>
    </html>
  `;
}
