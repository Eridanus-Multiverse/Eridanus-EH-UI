#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/home/ubuntu/achernar-memory/public/app}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/ubuntu/achernar-memory/releases/app}"
SERVICE="${SERVICE:-achernar-memory}"
RELEASE="${1:-}"

if [[ -z "${RELEASE}" ]]; then
  echo "usage: scripts/rollback-web.sh <release>"
  echo
  echo "available releases:"
  sudo find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort -r | head -20
  exit 1
fi

SOURCE_DIR="${BACKUP_ROOT}/${RELEASE}"
if ! sudo test -d "${SOURCE_DIR}"; then
  echo "rollback source not found: ${SOURCE_DIR}" >&2
  exit 1
fi

echo "[rollback] restore ${SOURCE_DIR} -> ${DEPLOY_DIR}"
sudo rm -rf "${DEPLOY_DIR}"
sudo mkdir -p "${DEPLOY_DIR}"
sudo cp -a "${SOURCE_DIR}/." "${DEPLOY_DIR}/"
printf '%s\n' "${RELEASE}" | sudo tee "${BACKUP_ROOT}/current-release.txt" >/dev/null

echo "[rollback] restart ${SERVICE}"
sudo systemctl restart "${SERVICE}"
sudo systemctl is-active "${SERVICE}"

echo "[rollback] health"
curl -s http://127.0.0.1:3200/health
printf '\n[rollback] done release=%s\n' "${RELEASE}"
