module.exports = {
  apps: [
    {
      name: "v3-backend",
      cwd: "/root/fnb-super-app/v3/backend",
      script: "./.venv/bin/python",
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 13800",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};
