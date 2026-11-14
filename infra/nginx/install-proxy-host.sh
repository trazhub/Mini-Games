#!/usr/bin/env bash
# Run ON THE EXISTING NGINX PROXY HOST (not the game VM) as root, from this directory.
# It only ADDS one site file and one snippet; it never edits your other sites.
#
#   sudo ./install-proxy-host.sh http    # stage 1: HTTP proxy to the VM, then prints the certbot command
#   sudo ./install-proxy-host.sh tls     # stage 2: final HTTPS config (needs the certificate from stage 1)
#
# Override the upstream or certificate with env vars if needed:
#   UPSTREAM=10.10.15.254:2567  CERT_DIR=/etc/letsencrypt/live/backend.opop.eu.org
set -euo pipefail

STAGE="${1:-}"
UPSTREAM="${UPSTREAM:-10.10.15.254:2567}"
CERT_DIR="${CERT_DIR:-/etc/letsencrypt/live/backend.opop.eu.org}"
SITE=/etc/nginx/sites-available/backend.opop.eu.org.conf
LINK=/etc/nginx/sites-enabled/backend.opop.eu.org.conf
SNIPPET=/etc/nginx/snippets/mgh_proxy_params.conf
HERE="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)."; exit 1; }
case "$STAGE" in http|tls) ;; *) echo "Usage: $0 http|tls"; exit 1 ;; esac

echo "1/5 Checking this host can reach the game VM at http://$UPSTREAM/health ..."
if ! curl -fsS -m 5 "http://$UPSTREAM/health" | grep -q '"ok":true'; then
  echo "FAILED: cannot reach the backend from this host. Fix routing/firewall first. Nothing was changed."
  exit 1
fi

if [ "$STAGE" = tls ]; then
  [ -s "$CERT_DIR/fullchain.pem" ] || { echo "No certificate at $CERT_DIR. Run stage 'http' and certbot first."; exit 1; }
  SRC="$HERE/backend.opop.eu.org.conf"
else
  SRC="$HERE/backend.opop.eu.org.bootstrap.conf"
fi

echo "2/5 Installing files (previous copies are saved with a .bak-<time> suffix) ..."
ts=$(date +%Y%m%d%H%M%S)
mkdir -p /etc/nginx/snippets /var/www/html
for f in "$SNIPPET" "$SITE"; do [ -e "$f" ] && cp -p "$f" "$f.bak-$ts"; done
install -m 644 "$HERE/mgh_proxy_params.conf" "$SNIPPET"
install -m 644 "$SRC" "$SITE"
sed -i "s#10\.10\.15\.254:2567#$UPSTREAM#g; s#/etc/letsencrypt/live/backend\.opop\.eu\.org#$CERT_DIR#g" "$SITE"
[ -e "$LINK" ] || ln -s "$SITE" "$LINK"

echo "3/5 Testing the Nginx configuration ..."
if ! nginx -t; then
  echo "nginx -t FAILED. Restoring the previous files; nothing was reloaded."
  for f in "$SNIPPET" "$SITE"; do
    if [ -e "$f.bak-$ts" ]; then mv "$f.bak-$ts" "$f"; else rm -f "$f"; fi
  done
  [ -e "$SITE" ] || rm -f "$LINK"
  exit 1
fi

echo "4/5 Reloading Nginx ..."
systemctl reload nginx

echo "5/5 Done ($STAGE)."
if [ "$STAGE" = http ]; then
  echo "Test:    curl -s http://backend.opop.eu.org/health"
  echo "Next:    certbot certonly --webroot -w /var/www/html -d backend.opop.eu.org"
  echo "Then:    sudo $0 tls"
else
  echo "Test:    curl -s https://backend.opop.eu.org/health   # expect {\"ok\":true,\"db\":\"up\"}"
fi
