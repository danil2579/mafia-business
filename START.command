#!/bin/sh
cd "$(dirname "$0")" || exit 1
export ALLOW_LAN=1
export NODE_ENV=production
node server.js
