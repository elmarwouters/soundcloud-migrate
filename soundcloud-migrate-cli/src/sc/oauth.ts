import crypto from "node:crypto";
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

const generatePkce = () => {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
};

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

    server.on("error", (error) => reject(error));

    server.listen(port, OAUTH_CONFIG.redirectHost, () => {
      logger.info({ port }, "OAuth callback server listening");
    });
  });

const exchangeCodeForToken = async (code: string, verifier: string, redirectUri: string) => {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.SOUNDCLOUD_CLIENT_ID,
    client_secret: config.SOUNDCLOUD_CLIENT_SECRET,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier
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
  const { verifier, challenge } = generatePkce();
  const state = base64UrlEncode(crypto.randomBytes(16));
  const redirectUri = `http://${OAUTH_CONFIG.redirectHost}:${config.REDIRECT_PORT}/callback`;

  const authorizeUrl = new URL(OAUTH_CONFIG.authorizeUrl);
  authorizeUrl.searchParams.set("client_id", config.SOUNDCLOUD_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);

  logger.info({ url: authorizeUrl.toString() }, "Opening SoundCloud authorization URL");
  await open(authorizeUrl.toString(), { wait: false });

  const { code } = await waitForOAuthCode(config.REDIRECT_PORT, state);
  const tokenResponse = await exchangeCodeForToken(code, verifier, redirectUri);
  const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

  upsertAccount(db, {
    name,
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: expiresAt
  });

  logger.info({ name }, "Stored OAuth tokens for account");
};
