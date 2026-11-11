#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.lock.txt
backend/.venv/bin/python backend/manage.py migrate --noinput
npm --prefix frontend ci --no-audit --no-fund
npm --prefix frontend run build
printf '\nSetup complete. Run ./scripts/dev.sh\n'
