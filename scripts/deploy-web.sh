#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-/tmp/eridanus-app-web-export}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/ubuntu/achernar-memory/public/app}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/ubuntu/achernar-memory/releases/app}"
SERVICE="${SERVICE:-achernar-memory}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"

cd "${APP_DIR}"

echo "[deploy] typecheck"
npx tsc --noEmit

echo "[deploy] export -> ${OUT_DIR}"
rm -rf "${OUT_DIR}"
EXPO_NO_TELEMETRY=1 CI=1 TMPDIR="${TMPDIR:-/tmp/eridanus-metro-export}" \
  npx expo export --platform web --output-dir "${OUT_DIR}"

echo "[deploy] patch pwa"
bash "${APP_DIR}/scripts/patch-pwa.sh" "${OUT_DIR}"

echo "[deploy] backup current -> ${BACKUP_DIR}"
sudo mkdir -p "${BACKUP_ROOT}"
if sudo test -d "${DEPLOY_DIR}"; then
  sudo mkdir -p "${BACKUP_DIR}"
  sudo cp -a "${DEPLOY_DIR}/." "${BACKUP_DIR}/"
fi

echo "[deploy] publish -> ${DEPLOY_DIR}"
sudo rm -rf "${DEPLOY_DIR}"
sudo mkdir -p "${DEPLOY_DIR}"
sudo cp -a "${OUT_DIR}/." "${DEPLOY_DIR}/"
printf '%s\n' "${STAMP}" | sudo tee "${BACKUP_ROOT}/current-release.txt" >/dev/null

echo "[deploy] restart ${SERVICE}"
sudo systemctl restart "${SERVICE}"
sudo systemctl is-active "${SERVICE}"

echo "[deploy] health"
curl -s http://127.0.0.1:3200/health
printf '\n[deploy] done release=%s backup=%s\n' "${STAMP}" "${BACKUP_DIR}"
