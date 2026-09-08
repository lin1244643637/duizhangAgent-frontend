#!/usr/bin/env bash

frontend_env_value() {
  local file="$1" key="$2"
  awk -v key="$key" '
    index($0, key "=") == 1 { value = substr($0, length(key) + 2) }
    END { if (value != "") print value }
  ' "$file"
}

frontend_load_runtime_config() {
  local file="$1" name value seen_ports=" " port
  local names=(
    WEB_SLOT_BIND
    FRONTEND_BLUE_PORT
    FRONTEND_GREEN_PORT
  )

  [[ -f "$file" ]] || {
    printf 'missing runtime config: %s\n' "$file" >&2
    return 2
  }

  for name in "${names[@]}"; do
    value="${!name-}"
    if [[ -z "$value" ]]; then
      value="$(frontend_env_value "$file" "$name")"
    fi
    value="${value%$'\r'}"
    case "$value" in
      \"*\") value="${value#\"}"; value="${value%\"}" ;;
      \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac

    if [[ "$name" == "WEB_SLOT_BIND" ]]; then
      value="${value:-127.0.0.1}"
      if [[ "$value" != "127.0.0.1" ]]; then
        printf 'WEB_SLOT_BIND must be 127.0.0.1, got: %s\n' "$value" >&2
        return 2
      fi
    else
      if [[ -z "$value" ]]; then
        case "$name" in
          FRONTEND_BLUE_PORT) value=18080 ;;
          FRONTEND_GREEN_PORT) value=18081 ;;
        esac
      fi
      if [[ ! "$value" =~ ^[1-9][0-9]*$ ]] || ((value > 65535)); then
        printf 'invalid port %s=%s\n' "$name" "$value" >&2
        return 2
      fi
    fi

    printf -v "$name" '%s' "$value"
    export "$name"
  done

  for port in "$FRONTEND_BLUE_PORT" "$FRONTEND_GREEN_PORT"; do
    case "$seen_ports" in
      *" $port "*)
        printf 'frontend ports must be unique, duplicate: %s\n' "$port" >&2
        return 2
        ;;
    esac
    seen_ports="${seen_ports}${port} "
  done
}

frontend_require_slot() {
  case "${1:-}" in
    blue|green) return 0 ;;
    *)
      printf 'invalid frontend slot: %s\n' "${1:-<empty>}" >&2
      return 2
      ;;
  esac
}

frontend_read_active_slot() {
  local file="$1" line slot=""
  if [[ ! -f "$file" ]]; then
    printf 'blue\n'
    return 0
  fi
  while IFS= read -r line; do
    case "$line" in
      '# active_frontend_slot='*)
        slot="${line#\# active_frontend_slot=}"
        break
        ;;
    esac
  done <"$file"
  if [[ -z "$slot" ]]; then
    printf 'blue\n'
    return 0
  fi
  frontend_require_slot "$slot" || return
  printf '%s\n' "$slot"
}

frontend_inactive_slot() {
  local slot="$1"
  frontend_require_slot "$slot" || return
  case "$slot" in
    blue) printf 'green\n' ;;
    green) printf 'blue\n' ;;
  esac
}

frontend_port() {
  local slot="$1"
  frontend_require_slot "$slot" || return
  case "$slot" in
    blue) printf '%s\n' "${FRONTEND_BLUE_PORT:-18080}" ;;
    green) printf '%s\n' "${FRONTEND_GREEN_PORT:-18081}" ;;
  esac
}

frontend_service() {
  local slot="$1"
  frontend_require_slot "$slot" || return
  printf 'frontend-%s\n' "$slot"
}

frontend_render_upstreams() {
  local active="$1" previous="$2" active_port previous_port
  frontend_require_slot "$active" || return
  frontend_require_slot "$previous" || return
  active_port="$(frontend_port "$active")"
  previous_port="$(frontend_port "$previous")"
  cat <<EOF
# Managed by frontend deploy/deploy.sh. Do not edit manually.
# active_frontend_slot=$active
# previous_frontend_slot=$previous
upstream yuanji_frontend_active {
    server 127.0.0.1:$active_port;
    keepalive 16;
}

upstream yuanji_frontend_previous {
    server 127.0.0.1:$previous_port;
    keepalive 8;
}
EOF
}
