#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────────────────
# Debtify — deployment script (debtify.solutions)
#
# This VPS hosts multiple other projects, so containers bind to two
# internal-only ports (not exposed publicly) and Nginx reverse-proxies
# debtify.solutions to them on 80/443 — see nginx/debtify.solutions.conf.
#
# BEFORE FIRST RUN:
#   1. Verify these two internal ports are free on this VPS:
#        ss -tlnp | grep -E ':7860|:7861'
#      If either is taken, change BACKEND_PORT / FRONTEND_PORT below AND
#      in nginx/debtify.solutions.conf (the proxy_pass targets).
#   2. Install the Nginx config once (see nginx/debtify.solutions.conf for
#      full instructions) and point DNS for debtify.solutions at this VPS.
#   3. Make sure server/.env exists on the VPS with a working MONGODB_URI
#      and CORS_ORIGIN=https://debtify.solutions (not committed to git —
#      copy it there separately).
#
# No REACT_APP_API_URL/REACT_APP_SOCKET_URL build-args are passed below —
# the frontend is built to use relative/same-origin API calls, which is
# correct once Nginx is proxying both frontend and backend under the same
# https://debtify.solutions domain.
# ─────────────────────────────────────────────────────────────────────────

BACKEND_PORT=7860
FRONTEND_PORT=7861

cd /root/debtify

echo ">> Code already pulled by CI — skipping git pull"

echo ">> Building backend..."
docker build -t debtify-backend ./server

echo ">> Building frontend (same-origin API via Nginx)..."
docker build -t debtify-frontend ./client

echo ">> Stopping old containers..."
docker stop debtify-backend-c 2>/dev/null || true
docker rm debtify-backend-c 2>/dev/null || true
docker stop debtify-frontend-c 2>/dev/null || true
docker rm debtify-frontend-c 2>/dev/null || true

echo ">> Starting backend on 127.0.0.1:${BACKEND_PORT} (internal only)..."
docker run -d \
  -p 127.0.0.1:${BACKEND_PORT}:5000 \
  --env-file ./server/.env \
  --name debtify-backend-c \
  --restart unless-stopped \
  --memory=4g \
  debtify-backend

echo ">> Starting frontend on 127.0.0.1:${FRONTEND_PORT} (internal only)..."
docker run -d \
  -p 127.0.0.1:${FRONTEND_PORT}:3000 \
  --name debtify-frontend-c \
  --restart unless-stopped \
  debtify-frontend

echo ">> Cleaning up old images..."
docker image prune -f

echo ">> Deployed internally on 127.0.0.1:${FRONTEND_PORT} / 127.0.0.1:${BACKEND_PORT}."
echo ">> Make sure nginx/debtify.solutions.conf is installed so https://debtify.solutions routes to them."
