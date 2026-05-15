/**
 * PM2 Ecosystem Configuration — Vibes Cloud
 *
 * Manages only the backend API server.
 * OpenCode instances are managed internally by OpenCodeManager.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart vibes-api
 *   pm2 logs vibes-api
 */
module.exports = {
  apps: [
    {
      name: "vibes-api",
      script: "dist/index.js",
      cwd: "/data/vibes/server",
      node_args: "--experimental-specifier-resolution=node",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        VIBES_WORKSPACES_DIR: "/data/vibes/workspaces",
        VIBES_SHARED_DIR: "/data/vibes/shared",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      watch: false,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/data/vibes/logs/vibes-api-error.log",
      out_file: "/data/vibes/logs/vibes-api-out.log",
    },
  ],
};
