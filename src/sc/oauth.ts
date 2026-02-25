import crypto from "node:crypto";
import { existsSync } from "node:fs";
import http from "node:http";
import { URL } from "node:url";
import open from "open";
import { config, OAUTH_CONFIG } from "../config.js";
import { logger } from "../logger.js";
import { upsertAccount } from "../db/db.js";
import type Database from "better-sqlite3";

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

const base64UrlEncode = (buffer: Buffer) =>
  buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const waitForOAuthCode = (port: number, expectedState: string) =>
  new Promise<{ code: string; state: string }>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400).end();
        return;
      }
      const url = new URL(req.url, `http://${OAUTH_CONFIG.redirectHost}:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing code or state.");
        return;
      }
      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid state.");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Authentication complete. You can close this window.");
      server.close();
      resolve({ code, state });
    });

    server.on("error", (error) => {
      server.close();
      reject(error);
    });

    server.listen(port, OAUTH_CONFIG.redirectHost, () => {
      logger.info({ port }, "OAuth callback server listening");
    });
  });

const exchangeCodeForToken = async (code: string, redirectUri: string) => {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.SOUNDCLOUD_CLIENT_ID,
    client_secret: config.SOUNDCLOUD_CLIENT_SECRET,
    redirect_uri: redirectUri,
    code
  });

  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token || !data.refresh_token || !data.expires_in) {
    throw new Error("Token response missing required fields");
  }
  return data;
};

export const refreshAccessToken = async (refreshToken: string) => {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.SOUNDCLOUD_CLIENT_ID,
    client_secret: config.SOUNDCLOUD_CLIENT_SECRET,
    refresh_token: refreshToken
  });

  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token || !data.refresh_token || !data.expires_in) {
    throw new Error("Refresh response missing required fields");
  }
  return data;
};

export const connectAccount = async (db: Database.Database, name: "source" | "target") => {
  const state = base64UrlEncode(crypto.randomBytes(16));
  const redirectUri = `http://${OAUTH_CONFIG.redirectHost}:${config.REDIRECT_PORT}/callback`;

  const authorizeUrl = new URL(OAUTH_CONFIG.authorizeUrl);
  authorizeUrl.searchParams.set("client_id", config.SOUNDCLOUD_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "non-expiring");
  authorizeUrl.searchParams.set("state", state);

  logger.info({ url: authorizeUrl.toString() }, "Opening SoundCloud authorization URL");
  await open(authorizeUrl.toString(), { wait: false });

  const { code } = await waitForOAuthCode(config.REDIRECT_PORT, state);
  const tokenResponse = await exchangeCodeForToken(code, redirectUri);
  const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

  upsertAccount(db, {
    name,
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: expiresAt
  });

  logger.info({ name }, "Stored OAuth tokens for account");
};

const findChromePath = (): string => {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chrome/Chromium executable found. Set the CHROME_PATH environment variable to point to your Chrome binary."
  );
};

export const headlessConnectAccount = async (
  db: Database.Database,
  name: "source" | "target",
  username: string,
  password: string
) => {
  const state = base64UrlEncode(crypto.randomBytes(16));
  const redirectUri = `http://${OAUTH_CONFIG.redirectHost}:${config.REDIRECT_PORT}/callback`;

  const authorizeUrl = new URL(OAUTH_CONFIG.authorizeUrl);
  authorizeUrl.searchParams.set("client_id", config.SOUNDCLOUD_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "non-expiring");
  authorizeUrl.searchParams.set("state", state);

  const codePromise = waitForOAuthCode(config.REDIRECT_PORT, state);

  const { launch } = await import("puppeteer-core");
  const browser = await launch({
    executablePath: findChromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    logger.info({ name, url: authorizeUrl.toString() }, "Opening SoundCloud authorization page in headless browser");

    await page.goto(authorizeUrl.toString(), { waitUntil: "networkidle2" });

    const usernameSelector =
      "input[type=\"email\"], input[name=\"username\"], input[autocomplete=\"username\"], input[autocomplete=\"email\"]";
    await page.waitForSelector(usernameSelector, { timeout: 15_000 });

    const usernameField = await page.$(usernameSelector);
    if (!usernameField) {
      throw new Error("Username input not found on the SoundCloud sign-in page");
    }
    await usernameField.type(username);

    // Check if password field is already visible (single-step form), otherwise
    // submit the email first and wait for the password field (two-step form).
    let passwordField = await page.$("input[type=\"password\"]");
    if (!passwordField) {
      await page.keyboard.press("Enter");
      await page.waitForSelector("input[type=\"password\"]", { timeout: 15_000 });
      passwordField = await page.$("input[type=\"password\"]");
    }
    if (!passwordField) {
      throw new Error("Password input not found on the SoundCloud sign-in page");
    }
    await passwordField.type(password);
    await page.keyboard.press("Enter");

    logger.info({ name }, "Credentials submitted, waiting for OAuth callback");
    const { code } = await codePromise;

    const tokenResponse = await exchangeCodeForToken(code, redirectUri);
    const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

    upsertAccount(db, {
      name,
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: expiresAt
    });

    logger.info({ name }, "Stored OAuth tokens for account via headless browser");
  } finally {
    await browser.close();
  }
};
