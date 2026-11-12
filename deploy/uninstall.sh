#!/usr/bin/env bash
# Installed by install.sh as /usr/local/bin/cnc-designer-uninstall - stops
# and removes the CNC-Designer service, its files, its system user and this
# command, after an explicit confirmation. Project files are not affected:
# they only exist where you saved them from the browser.
set -euo pipefail

INSTALL_DIR="/opt/cnc-designer"
SERVICE_NAME="cnc-designer"
SERVICE_USER="cnc-designer"

GREEN='\033[0;32m'
NC='\033[0m'
step() { echo -e "${GREEN}==> $1${NC}"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this as root: sudo cnc-designer-uninstall" >&2
  exit 1
fi

echo "This will remove:"
echo "  - the $SERVICE_NAME systemd service (stopped and disabled)"
echo "  - $INSTALL_DIR"
echo "  - the '$SERVICE_USER' system user"
echo "  - the cnc-designer-uninstall command"
read -rp "Type 'yes' to continue: " confirm
if [[ "$confirm" != "yes" ]]; then
  echo "Aborted, nothing was removed."
  exit 1
fi

step "Stopping and disabling the service..."
systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
rm -f "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload

step "Removing $INSTALL_DIR..."
rm -rf "$INSTALL_DIR"

step "Removing the '$SERVICE_USER' system user..."
if id -u "$SERVICE_USER" >/dev/null 2>&1; then userdel "$SERVICE_USER"; fi

rm -f /usr/local/bin/cnc-designer-uninstall
echo "CNC-Designer has been removed."
