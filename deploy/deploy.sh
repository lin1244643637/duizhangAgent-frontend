#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/frontend_blue_green.sh
source "$SCRIPT_DIR/frontend_blue_green.sh"

APP_DIR="${APP_DIR:-/opt/duizhangAgent-frontend}"
BRANCH="${DEPLOY_BRANCH:-main}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
LOCK_FILE="${LOCK_FILE:-/tmp/duizhangAgent-frontend-deploy.lock}"
LOCK_WAIT_SECONDS="${DEPLOY_LOCK_WAIT_SECONDS:-1800}"
NGINX_STATE_DIR="${NGINX_STATE_DIR:-/etc/nginx/duizhangAgent}"
FRONTEND_UPSTREAM_FILE="${FRONTEND_UPSTREAM_FILE:-$NGINX_STATE_DIR/frontend-upstreams.conf}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_url() {
  local label="$1" url="$2"
  for i in {1..60}; do
    if curl -fsS --max-time 5 "$url" >/dev/null; then
      log "$label ok"
      return 0
    fi
    sleep 2
  done
  log "$label failed: $url"
  return 1
}

activate_frontend_slot() {
  local target_slot="$1" previous_slot="$2" candidate
  install -d -m 0755 "$NGINX_STATE_DIR"
  candidate="$(mktemp "$NGINX_STATE_DIR/frontend-upstreams.conf.XXXXXX")"
  frontend_render_upstreams "$target_slot" "$previous_slot" >"$candidate"
  chmod 0644 "$candidate"
  mv -f -- "$candidate" "$FRONTEND_UPSTREAM_FILE"
  nginx -t
  systemctl reload nginx
}

on_error() {
  local status="$1" line="$2"
  trap - ERR
  set +e
  log "frontend deploy failed at line $line"
  compose ps || true
  exit "$status"
}

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  return 0
fi

cd "$APP_DIR"
trap 'on_error "$?" "$LINENO"' ERR

exec 9>"$LOCK_FILE"
log "wait deploy lock: $LOCK_FILE"
flock -w "$LOCK_WAIT_SECONDS" 9 || {
  log "another frontend deploy is still running after ${LOCK_WAIT_SECONDS}s"
  exit 1
}

if [[ ! -f "$ENV_FILE" ]]; then
  log "missing $ENV_FILE; copy .env.production.example and fill values first"
  exit 1
fi

frontend_load_runtime_config "$ENV_FILE"

log "fetch origin/$BRANCH"
git fetch origin "$BRANCH"
TARGET_REV="$(git rev-parse "origin/$BRANCH")"
RELEASE_TAG="${TARGET_REV:0:12}"
export FRONTEND_IMAGE="${FRONTEND_IMAGE_REPOSITORY:-duizhangagent-frontend}:$RELEASE_TAG"

log "reset working tree to origin/$BRANCH"
git reset --hard "origin/$BRANCH"

CURRENT_ACTIVE_SLOT="$(frontend_read_active_slot "$FRONTEND_UPSTREAM_FILE")"
TARGET_SLOT="$(frontend_inactive_slot "$CURRENT_ACTIVE_SLOT")"
TARGET_SERVICE="$(frontend_service "$TARGET_SLOT")"
TARGET_PORT="$(frontend_port "$TARGET_SLOT")"

log "build frontend image: $FRONTEND_IMAGE"
compose build "$TARGET_SERVICE"

log "start frontend slot: $TARGET_SLOT ($TARGET_SERVICE)"
compose up -d --force-recreate "$TARGET_SERVICE"
wait_for_url "$TARGET_SLOT frontend" "http://127.0.0.1:$TARGET_PORT/yuanji/"

activate_frontend_slot "$TARGET_SLOT" "$CURRENT_ACTIVE_SLOT"
wait_for_url "public frontend" "https://blackwave.org.cn/yuanji/"
wait_for_url "frontend webhook" "http://127.0.0.1:9010/health"

log "frontend deploy completed"
