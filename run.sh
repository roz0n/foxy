#!/usr/bin/env bash
# `npm start`: check what the app checkout needs (see setup.mjs), then start the Foxy server.
# Point it at your MetaMask Mobile checkout with FOXY_REPO, or run it from inside that checkout:
#   FOXY_REPO=~/dev/metamask-mobile npm start
set -euo pipefail
export FOXY_REPO="${FOXY_REPO:-$PWD}"
cd "$(dirname "$0")"

status=0
node setup.mjs || status=$?
case "$status" in
  0) ;;
  4) exit 0 ;; # a Foxy is already running; setup printed its address
  *) exit "$status" ;;
esac

echo
exec node server.mjs
