#!/bin/sh
# Build command for Cloudflare Workers Builds. The Worker's build settings run
# it as `sh scripts/cloudflare-build.sh`. It runs the same gate as
# .github/workflows/hugo.yml, then the production build.
#
# The build image takes its Hugo and Node versions from two build variables in
# the Cloudflare dashboard: HUGO_VERSION and NODE_VERSION. The pins themselves
# live in .github/workflows/ci.yml, so this script reads them from that file
# and stops when the image has a different version. Without this check, a
# missing variable builds the site with the image's default Hugo.
set -eu
cd "$(dirname "$0")/.."

want_hugo=$(sed -n 's/^ *HUGO_VERSION: *//p' .github/workflows/ci.yml)
want_node=$(sed -n "s/^ *node-version: *'\(.*\)'/\1/p" .github/workflows/ci.yml)
if [ -z "$want_hugo" ] || [ -z "$want_node" ]; then
  echo "cloudflare-build: cannot read the Hugo and Node pins from ci.yml" >&2
  exit 1
fi

have_hugo=$(hugo version)
case "$have_hugo" in
  "hugo v${want_hugo}"[-+\ ]*) ;;
  *) echo "cloudflare-build: want Hugo ${want_hugo}, have: ${have_hugo}" >&2; exit 1 ;;
esac

have_node=$(node --version)
case "$have_node" in
  "v${want_node}."*) ;;
  *) echo "cloudflare-build: want Node ${want_node}, have: ${have_node}" >&2; exit 1 ;;
esac

npm ci
npm run typecheck
npm test
hugo --minify
