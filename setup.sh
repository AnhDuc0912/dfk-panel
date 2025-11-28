#!/usr/bin/env bash
set -euo pipefail

# setup.sh - prepare host folders and (optionally) a restricted sudoers entry
# Usage:
#   sudo ./setup.sh [--uid UID] [--gid GID] [--repo /host/path/repos] [--sites /host/path/sites-enabled] [--sudo-user username]
# Examples:
#   sudo ./setup.sh --uid 1000 --gid 1000 --repo /data/dfk-panel/repos --sites /data/dfk-panel/sites-enabled
#   sudo ./setup.sh --sudo-user dfk

UID_TO_SET=1000
GID_TO_SET=1000
HOST_REPO_DIR="/data/dfk-panel/repos"
HOST_SITES_DIR="/data/dfk-panel/sites-enabled"
SUDO_USER=""

usage(){
  cat <<EOF
Usage: $0 [options]
Options:
  --uid UID            UID to own the created dirs (default 1000)
  --gid GID            GID to own the created dirs (default 1000)
  --repo PATH          Host path for repositories (default /data/dfk-panel/repos)
  --sites PATH         Host path for nginx sites-enabled (default /data/dfk-panel/sites-enabled)
  --sudo-user USER     Create a restricted sudoers entry for USER allowing required commands passwordless
  -h, --help           Show this help

Examples:
  sudo $0 --uid 1000 --gid 1000 --repo /data/dfk-panel/repos --sites /data/dfk-panel/sites-enabled
  sudo $0 --sudo-user dfk
EOF
}

while [[ ${#-} -gt 0 ]]; do
  case "$1" in
    --uid) UID_TO_SET="$2"; shift 2;;
    --gid) GID_TO_SET="$2"; shift 2;;
    --repo) HOST_REPO_DIR="$2"; shift 2;;
    --sites) HOST_SITES_DIR="$2"; shift 2;;
    --sudo-user) SUDO_USER="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    "") shift ;;
    *) echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

echo "Running setup with: UID=${UID_TO_SET} GID=${GID_TO_SET} REPO=${HOST_REPO_DIR} SITES=${HOST_SITES_DIR} sudo-user=${SUDO_USER}"

run_as_root(){
  if [ "$(id -u)" -ne 0 ]; then
    sudo "$@"
  else
    "$@"
  fi
}

echo "Creating host directories..."
run_as_root mkdir -p "${HOST_REPO_DIR}"
run_as_root mkdir -p "${HOST_SITES_DIR}"

echo "Setting ownership to ${UID_TO_SET}:${GID_TO_SET}..."
run_as_root chown -R ${UID_TO_SET}:${GID_TO_SET} "${HOST_REPO_DIR}" || true
run_as_root chown -R ${UID_TO_SET}:${GID_TO_SET} "${HOST_SITES_DIR}" || true

echo "Setting mode 755 for directories..."
run_as_root chmod 0755 "${HOST_REPO_DIR}" || true
run_as_root chmod 0755 "${HOST_SITES_DIR}" || true

if [ -n "${SUDO_USER}" ]; then
  echo "Preparing sudoers entry for user ${SUDO_USER} (restricted to required commands)..."
  # Detect absolute paths for required commands
  CP_PATH=$(command -v cp || true)
  CHOWN_PATH=$(command -v chown || true)
  CHMOD_PATH=$(command -v chmod || true)
  MKDIR_PATH=$(command -v mkdir || true)
  SYSTEMCTL_PATH=$(command -v systemctl || true)
  NGINX_PATH=$(command -v nginx || true)

  SUDOERS_FILE="/etc/sudoers.d/dfkpanel-${SUDO_USER}"
  echo "Writing sudoers to ${SUDOERS_FILE}"

  # Build list of allowed commands with absolute paths (skip missing)
  ALLOW_CMDS=()
  [ -n "${MKDIR_PATH}" ] && ALLOW_CMDS+=("${MKDIR_PATH}")
  [ -n "${CP_PATH}" ] && ALLOW_CMDS+=("${CP_PATH}")
  [ -n "${CHOWN_PATH}" ] && ALLOW_CMDS+=("${CHOWN_PATH}")
  [ -n "${CHMOD_PATH}" ] && ALLOW_CMDS+=("${CHMOD_PATH}")
  [ -n "${SYSTEMCTL_PATH}" ] && ALLOW_CMDS+=("${SYSTEMCTL_PATH}")
  [ -n "${NGINX_PATH}" ] && ALLOW_CMDS+=("${NGINX_PATH}")

  if [ ${#ALLOW_CMDS[@]} -eq 0 ]; then
    echo "Warning: no command paths detected; sudoers will not be created.";
  else
    # join commands with ', '
    IFS=','; CMDS_JOINED="${ALLOW_CMDS[*]}"; unset IFS

    sudo tee "${SUDOERS_FILE}" > /dev/null <<EOF
# allow ${SUDO_USER} to run a small set of admin commands without a password
${SUDO_USER} ALL=(root) NOPASSWD: ${CMDS_JOINED}
EOF

    run_as_root chmod 0440 "${SUDOERS_FILE}"
    echo "Wrote sudoers entry for ${SUDO_USER} -> ${SUDOERS_FILE}"
    echo "Verify with: sudo -l -U ${SUDO_USER}"
  fi
fi

cat <<EOF
Done.

Next steps (examples):
- Set these in .env or environment before running docker compose:
  HOST_REPO_DIR=${HOST_REPO_DIR}
  HOST_SITES_DIR=${HOST_SITES_DIR}
  UID=${UID_TO_SET}
  GID=${GID_TO_SET}

- If you created a sudoers entry, set NGINX_USE_SUDO=true in .env so the panel prefixes admin commands with sudo.

If something failed above, re-run this script with sudo and check the error messages.
EOF

exit 0
