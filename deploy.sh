#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────────────────
# Debtify — deployment script
#
# This VPS hosts multiple other projects, so this app does NOT use
# `--network host`. It binds to two specific host ports instead, chosen to
# be unlikely to collide with anything else already running.
#
# BEFORE FIRST RUN:
#   1. Verify these two ports are actually free on this VPS:
#        ss -tlnp | grep -E ':7860|:7861'
#      If either is taken, change BACKEND_PORT / FRONTEND_PORT below.
#   2. Set PUBLIC_HOST below to this VPS's public IP (or domain, once you
#      have one) so the frontend build knows where to reach the API.
#   3. Make sure server/.env exists on the VPS with a working MONGODB_URI
#      (not committed to git — copy it there separately).
# ─────────────────────────────────────────────────────────────────────────

BACKEND_PORT=7860
FRONTEND_PORT=7861
PUBLIC_HOST="CHANGE_ME"   # e.g. http://123.45.67.89  or  https://debtify.example.com

cd /root/debtify

echo ">> Code already pulled by CI — skipping git pull"

echo ">> Building backend..."
docker build -t debtify-backend ./server

echo ">> Building frontend (API at ${PUBLIC_HOST}:${BACKEND_PORT})..."
docker build \
  --build-arg REACT_APP_API_URL="${PUBLIC_HOST}:${BACKEND_PORT}" \
  --build-arg REACT_APP_SOCKET_URL="${PUBLIC_HOST}:${BACKEND_PORT}" \
  -t debtify-frontend ./client

echo ">> Stopping old containers..."
docker stop debtify-backend-c 2>/dev/null || true
docker rm debtify-backend-c 2>/dev/null || true
docker stop debtify-frontend-c 2>/dev/null || true
docker rm debtify-frontend-c 2>/dev/null || true

echo ">> Starting backend on port ${BACKEND_PORT}..."
docker run -d \
  -p ${BACKEND_PORT}:5000 \
  --env-file ./server/.env \
  --name debtify-backend-c \
  --restart unless-stopped \
  --memory=4g \
  debtify-backend

echo ">> Starting frontend on port ${FRONTEND_PORT}..."
docker run -d \
  -p ${FRONTEND_PORT}:3000 \
  --name debtify-frontend-c \
  --restart unless-stopped \
  debtify-frontend

echo ">> Cleaning up old images..."
docker image prune -f

echo ">> Deployed. Frontend: ${PUBLIC_HOST}:${FRONTEND_PORT}  |  Backend: ${PUBLIC_HOST}:${BACKEND_PORT}"
