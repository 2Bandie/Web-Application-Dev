#!/usr/bin/env bash
set -euo pipefail
python manage.py migrate --noinput
# One process / one Render instance: Channels groups are in memory.
exec daphne -b 0.0.0.0 -p "${PORT:-8001}" config.asgi:application
