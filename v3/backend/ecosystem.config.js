module.exports = {
  apps: [
    {
      name: "v3-backend",
      cwd: "/root/fnb-super-app/v3/backend",
      script: "./.venv/bin/python",
      // --no-proxy-headers: keep scope client = real TCP peer so the rate
      // limiter's proxy-chain detection (loopback ⇒ Caddy) works; without
      // this uvicorn rewrites client from XFF and per-IP keys shard across
      // Cloudflare edge nodes.
      // --no-access-log: guest-pay URLs carry 24h JWTs in the query string;
      // uvicorn's access log writes full URLs. The app's own
      // RequestLoggingMiddleware already logs method+path (no query).
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 13800 --no-proxy-headers --no-access-log",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
    {
      name: "kiosk-v3",
      cwd: "/root/fnb-super-app/v3/customer-pwa",
      script: "npx",
      args: "next start -p 13840",
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
