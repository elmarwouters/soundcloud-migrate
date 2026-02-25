import { z } from "zod";

const envSchema = z.object({
  SOUNDCLOUD_CLIENT_ID: z.string().min(1, "SOUNDCLOUD_CLIENT_ID is required"),
  SOUNDCLOUD_CLIENT_SECRET: z.string().min(1, "SOUNDCLOUD_CLIENT_SECRET is required"),
  REDIRECT_PORT: z.coerce.number().int().positive().default(17892),
  DB_PATH: z.string().min(1).default("./data/migrate.sqlite"),
  USER_AGENT: z.string().min(1).default("soundcloud-migrate-cli/0.1.0"),
  SLEEP_MS: z.coerce.number().int().nonnegative().default(900)
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = envSchema.parse(process.env);

export const OAUTH_CONFIG = {
  authorizeUrl: "https://secure.soundcloud.com/authorize",
  tokenUrl: "https://api.soundcloud.com/oauth2/token",
  apiBaseUrl: "https://api.soundcloud.com",
  redirectHost: "127.0.0.1"
};
