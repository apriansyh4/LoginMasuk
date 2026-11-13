#!/usr/bin/env bash
# AR-LOKAL ai-service on an Ubuntu 24.04 VM (Azure or any Linux server), CPU mode.
# Runs uvicorn + an ngrok tunnel as systemd services, so both start on boot and restart on failure.
# Usage (on the VM):  bash ~/app/scripts/azure/setup.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AI="$APP_DIR/ai-service"
RUN_USER="$(id -un)"
ENV_FILE=/etc/ar-lokal/ai.env

say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }

say "1/6 Kunci rahasia (tidak ditampilkan saat diketik)"
if [ ! -f "$ENV_FILE" ]; then
  read -rp  "Supabase URL (https://xxxx.supabase.co): " SB_URL
  read -rsp "Supabase SECRET key (sb_secret_...): " SB_KEY; echo
  read -rsp "AI service secret (sama dengan AI_SERVICE_SECRET di Vercel): " SVC_SECRET; echo
  sudo mkdir -p /etc/ar-lokal
  sudo tee "$ENV_FILE" >/dev/null <<ENV
AILOKAL_SERVICE_SECRET=$SVC_SECRET
AILOKAL_SUPABASE_URL=$SB_URL
AILOKAL_SUPABASE_SERVICE_KEY=$SB_KEY
AILOKAL_ALLOW_CPU_RECONSTRUCTION=true
AILOKAL_PRELOAD_MODELS=true
ENV
  sudo chmod 600 "$ENV_FILE"
else
  echo "Sudah ada: $ENV_FILE (hapus file itu kalau ingin mengisi ulang)"
fi
if [ ! -f "$HOME/.config/ngrok/ngrok.yml" ] || [ ! -f /etc/ar-lokal/ngrok-domain ]; then
  read -rsp "ngrok authtoken: " NGROK_TOKEN; echo
  read -rp  "ngrok domain (contoh: abcd-1234.ngrok-free.dev): " NGROK_DOMAIN
  NGROK_DOMAIN="${NGROK_DOMAIN#https://}"; NGROK_DOMAIN="${NGROK_DOMAIN%/}"
  echo "$NGROK_DOMAIN" | sudo tee /etc/ar-lokal/ngrok-domain >/dev/null
fi

say "2/6 Paket sistem + swap 8 GB"
sudo apt-get update -y
sudo apt-get install -y python3-venv python3-dev build-essential libgl1 libglib2.0-0 git curl
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

say "3/6 Library Python (PyTorch versi CPU dulu supaya tidak mengunduh CUDA)"
cd "$AI"
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt -r requirements-models.txt -r requirements-reconstruction.txt

say "4/6 Model AI (ISNet, YOLOX, MediaPipe, TripoSR)"
python -I scripts/download_models.py

say "5/6 ngrok"
if ! command -v ngrok >/dev/null; then
  curl -fsSL https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz -o /tmp/ngrok.tgz
  sudo tar -xzf /tmp/ngrok.tgz -C /usr/local/bin
fi
[ -n "${NGROK_TOKEN:-}" ] && ngrok config add-authtoken "$NGROK_TOKEN" >/dev/null
DOMAIN="$(cat /etc/ar-lokal/ngrok-domain)"

say "6/6 Layanan otomatis (systemd)"
sudo tee /etc/systemd/system/ar-lokal-ai.service >/dev/null <<UNIT
[Unit]
Description=AR-LOKAL ai-service
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$AI
EnvironmentFile=$ENV_FILE
ExecStart=$AI/.venv/bin/uvicorn ai_service.app:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo tee /etc/systemd/system/ar-lokal-ngrok.service >/dev/null <<UNIT
[Unit]
Description=AR-LOKAL ngrok tunnel
After=network-online.target ar-lokal-ai.service
Wants=network-online.target

[Service]
User=$RUN_USER
ExecStart=/usr/local/bin/ngrok http --url=https://$DOMAIN 127.0.0.1:8000 --log stdout
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now ar-lokal-ai.service ar-lokal-ngrok.service

echo "Menunggu ai-service memuat model (bisa 1-3 menit)..."
TOKEN="$(sudo grep '^AILOKAL_SERVICE_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
for _ in $(seq 1 120); do
  if OUT="$(curl -fsS -H "x-service-token: $TOKEN" http://127.0.0.1:8000/health 2>/dev/null)"; then
    echo "$OUT" | python3 -m json.tool | grep -E 'validationAvailable|reconstructionAvailable|cpuMode'
    say "SELESAI. Isi AI_SERVICE_URL di Vercel dengan: https://$DOMAIN  (lalu Redeploy)"
    exit 0
  fi
  sleep 3
done
echo "ai-service belum merespons. Lihat log: sudo journalctl -u ar-lokal-ai -n 80 --no-pager"
exit 1
