#!/usr/bin/env bash
# Install or upgrade CNC-Designer as a systemd service on this machine.
#
# Run it as root from a checkout of the repository:
#   sudo deploy/install.sh
#
# The script builds the app in the checkout, copies the result to
# /opt/cnc-designer/www and (re)starts the service on port 8090.
# To upgrade, update the checkout (git pull) and run the script again.
set -euo pipefail

INSTALL_DIR="/opt/cnc-designer"
SERVICE_NAME="cnc-designer"
SERVICE_USER="cnc-designer"
PORT=8090
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

GREEN='\033[0;32m'
NC='\033[0m'
step() { echo -e "${GREEN}==> $1${NC}"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this as root: sudo deploy/install.sh" >&2
  exit 1
fi

for cmd in node npm python3 systemctl; do
  command -v "$cmd" >/dev/null || { echo "$cmd is required but not installed." >&2; exit 1; }
done

# Build as the user who called sudo, so the checkout does not end up with
# files owned by root.
BUILD_USER="${SUDO_USER:-root}"
step "Building the app in $REPO_DIR (as $BUILD_USER)..."
sudo -u "$BUILD_USER" bash -c "cd '$REPO_DIR' && npm ci && npm run build"

step "Setting up the '$SERVICE_USER' system user..."
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

step "Copying the app to $INSTALL_DIR/www..."
mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/www.new"
cp -r "$REPO_DIR/dist" "$INSTALL_DIR/www.new"
rm -rf "$INSTALL_DIR/www"
mv "$INSTALL_DIR/www.new" "$INSTALL_DIR/www"
chown -R root:root "$INSTALL_DIR"
chmod -R a+rX "$INSTALL_DIR"

step "Installing the systemd service and the uninstall command..."
cp "$REPO_DIR/deploy/cnc-designer.service" "/etc/systemd/system/$SERVICE_NAME.service"
install -m 755 "$REPO_DIR/deploy/uninstall.sh" /usr/local/bin/cnc-designer-uninstall
systemctl daemon-reload

step "Starting the service..."
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"

cat <<MSG

CNC-Designer is installed in $INSTALL_DIR and running.
Open http://$(hostname):$PORT/ from a machine in your network.

To upgrade later: update the checkout and run this script again.
To remove it:     sudo cnc-designer-uninstall
MSG
