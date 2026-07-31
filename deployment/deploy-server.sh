#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/var/www/pay-swagger"
DATA_DIR="/var/www/pay-swagger-data"
SITE_CONFIG="/etc/nginx/sites-available/hl-platform"
NGINX_SNIPPET="/etc/nginx/snippets/pay-swagger.conf"
FIRST_DEPLOY="${1:-}"

export PATH="/opt/node24/bin:$PATH"
export COREPACK_NPM_REGISTRY="https://registry.npmmirror.com"
export npm_config_registry="https://registry.npmmirror.com"
export DATABASE_URL="file:${DATA_DIR}/production.db"
export DEMO_OAUTH_REDIRECT_URI="http://49.232.198.140/pay-swagger/admin/oauth/callback"

cd "$APP_DIR"

mkdir -p "$DATA_DIR"
sudo env PATH="/opt/node24/bin:$PATH" corepack enable pnpm
corepack pnpm install --frozen-lockfile
corepack pnpm db:generate
corepack pnpm db:push

if [[ "$FIRST_DEPLOY" == "--first-deploy" ]]; then
  corepack pnpm db:seed
fi

VITE_API_BASE_URL="/pay-swagger/api/v1" \
VITE_PUBLIC_BASE="/pay-swagger/" \
  corepack pnpm --filter @monetizelab/customer-web build

VITE_API_BASE_URL="/pay-swagger/api/v1" \
VITE_PUBLIC_BASE="/pay-swagger/admin/" \
  corepack pnpm --filter @monetizelab/admin-web build

corepack pnpm --filter @monetizelab/api build

pm2 startOrReload deployment/ecosystem.config.cjs --env production
pm2 save

sudo install -m 0644 deployment/nginx-pay-swagger.conf "$NGINX_SNIPPET"

if ! sudo grep -q "include /etc/nginx/snippets/pay-swagger.conf;" "$SITE_CONFIG"; then
  sudo cp "$SITE_CONFIG" "${SITE_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
  sudo sed -i "/# 后端API代理/i\\    include /etc/nginx/snippets/pay-swagger.conf;\\n" "$SITE_CONFIG"
fi

sudo nginx -t
sudo systemctl reload nginx

echo "Deployment completed: http://49.232.198.140/pay-swagger/"
