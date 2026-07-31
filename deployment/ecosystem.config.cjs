module.exports = {
  apps: [
    {
      name: "pay-swagger-api",
      cwd: "/var/www/pay-swagger/apps/api",
      script: "dist/src/main.js",
      interpreter: "/opt/node24/bin/node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        API_PORT: "3200",
        DATABASE_URL: "file:/var/www/pay-swagger-data/production.db",
        CUSTOMER_WEB_ORIGIN: "http://49.232.198.140",
        ADMIN_WEB_ORIGIN: "http://49.232.198.140",
        DEMO_OAUTH_REDIRECT_URI: "http://49.232.198.140/pay-swagger/admin/oauth/callback",
      },
    },
  ],
};

