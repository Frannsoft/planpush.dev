#!/bin/sh
# Fix ownership of volume-mounted data dir (runs as root briefly)
chown -R planpush:planpush /app/data 2>/dev/null || true
exec su-exec planpush node src/server.js
