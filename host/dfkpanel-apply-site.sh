#!/usr/bin/env bash
set -euo pipefail

# dfkpanel-apply-site.sh
# Host helper script to install an nginx site file, test nginx config, and reload nginx.
# Usage (as root or via sudo):
#   dfkpanel-apply-site.sh /path/to/new-site.conf
# The script will copy the provided file into the nginx sites-enabled dir,
# test nginx config and reload on success. On failure the temporary file is removed
# and nginx is left untouched.

DEST_DIR="/etc/nginx/sites-enabled"
NGINX_CONF="/etc/nginx/nginx.conf"

usage(){
  cat <<EOF
Usage: $0 /path/to/site.conf
Installs the given site file into ${DEST_DIR}, runs 'nginx -t -c ${NGINX_CONF}',
and reloads nginx on success.

Example:
  sudo $0 /data/dfk-panel/sites-enabled/example.com.conf
EOF
}

if [ "$#" -lt 1 ]; then
  usage
  exit 2
fi

SRC="$1"

if [ ! -f "$SRC" ]; then
  echo "Source file not found: $SRC" >&2
  exit 3
fi

BASE=$(basename "$SRC")
TMP_DEST="${DEST_DIR}/${BASE}.tmp.$$"
FINAL_DEST="${DEST_DIR}/${BASE}"

echo "Copying $SRC -> $TMP_DEST"
cp "$SRC" "$TMP_DEST"
chmod 0644 "$TMP_DEST"

echo "Testing nginx config..."
if nginx -t -c "$NGINX_CONF" >/dev/null 2>&1; then
  echo "nginx test passed, moving into place and reloading"
  mv "$TMP_DEST" "$FINAL_DEST"
  # ensure ownership and perms
  chown root:root "$FINAL_DEST" || true
  chmod 0644 "$FINAL_DEST" || true
  if command -v systemctl >/dev/null 2>&1; then
    systemctl reload nginx
  else
    nginx -s reload
  fi
  echo "Installed $FINAL_DEST and reloaded nginx"
  exit 0
else
  echo "nginx test failed — removing temporary file" >&2
  rm -f "$TMP_DEST"
  nginx -t -c "$NGINX_CONF" || true
  exit 4
fi
