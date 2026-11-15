import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

export default defineConfig({
  test: {
    // The mock Telegram server is started by test/global-setup.ts (Node side)
    // on a fixed port, so the worker can be pointed at it with a plain var.
    globalSetup: "./test/global-setup.ts",
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        // NOTE: in Miniflare's V4 option shape there is no `vars` field —
        // plain-text variables go under `bindings` (a `vars` key here is
        // silently stripped by the options parser, which is why the worker
        // previously saw no TG_API_BASE_URL at all).
        bindings: {
          TG_BOT_TOKEN: "test-bot-token",
          // The worker supports a custom Bot API base URL (see bot.ts getBaseUrl),
          // which is what makes the download path testable without the real API.
          TG_API_BASE_URL: "http://127.0.0.1:18777",
          STORAGE_CHANNEL_ID: "-1001234567890",
          DRIVE_AUTH_TOKEN: "test-admin-token",
          AGENT_API_TOKEN: "test-agent-token",
          // Test-only AES-GCM key for the share-password display copy
          // (see src/passwords.ts). 32 random bytes, base64url.
          SHARE_PASSWORD_KEY: "fxO4F0JaGKN65Ttsyv-MqWfn78m0xfId8ssgAdlv7PU",
        },
      },
    }),
  ],
});
