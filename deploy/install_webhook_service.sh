#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/duizhangAgent-frontend}"
SERVICE_NAME="duizhang-frontend-deploy-webhook.service"

if [[ "${EUID}" -ne 0 ]]; then
  echo "please run with sudo: sudo APP_DIR=${APP_DIR} bash deploy/install_webhook_service.sh"
  exit 1
fi

if [[ ! -f "${APP_DIR}/.env.production" ]]; then
  echo "missing ${APP_DIR}/.env.production"
  exit 1
fi

install -m 0644 "${APP_DIR}/deploy/${SERVICE_NAME}" "/etc/systemd/system/${SERVICE_NAME}"
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"
systemctl status "${SERVICE_NAME}" --no-pager
