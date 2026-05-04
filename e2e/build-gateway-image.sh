#!/usr/bin/env bash
# Build a goja-enabled Tyk gateway docker image for e2e testing.
#
# Why: the published Tyk OSS image (v5.x) ships otto, which doesn't support
# goja-only features used by our examples (globalThis, ES2015+ syntax in
# bundled npm deps without down-transpilation). This script cross-compiles the
# gateway from source on the goja branch and overlays it onto the published
# image so we keep templates and config unchanged. Delete this file once the
# goja branch merges and a published image with goja support exists.
#
# Inputs (env vars):
#   TYK_SRC      path to a tyk gateway source checkout (defaults to a sibling
#                of this repo at ../tyk)
#   IMAGE_TAG    output image tag (default: tyk-gateway:goja-dev)
set -euo pipefail

cd "$(dirname "$0")"

TYK_SRC="${TYK_SRC:-$(cd ../../tyk 2>/dev/null && pwd || true)}"
IMAGE_TAG="${IMAGE_TAG:-tyk-gateway:goja-dev}"

if [ -z "${TYK_SRC:-}" ] || [ ! -f "$TYK_SRC/main.go" ]; then
  echo "ERROR: TYK_SRC not set and no tyk source found at ../tyk."
  echo "Either:"
  echo "  - export TYK_SRC=/path/to/tyk-gateway-source"
  echo "  - or clone TykTechnologies/tyk@feature/goja-driver as a sibling of this repo"
  exit 1
fi

# Pick GOARCH to match the docker host
GOARCH="${GOARCH:-$(uname -m)}"
case "$GOARCH" in
  arm64|aarch64) GOARCH=arm64 ;;
  x86_64|amd64)  GOARCH=amd64 ;;
  *) echo "Unsupported arch: $GOARCH" >&2; exit 1 ;;
esac

BIN=tyk-linux-${GOARCH}

echo "=== Cross-compiling Tyk for linux/${GOARCH} from $TYK_SRC ==="
(
  cd "$TYK_SRC"
  CGO_ENABLED=0 GOOS=linux GOARCH="$GOARCH" go build -o "$OLDPWD/$BIN" -trimpath .
)

echo "=== Building docker image $IMAGE_TAG ==="
docker build -f gateway.Dockerfile --build-arg TYK_BINARY="$BIN" -t "$IMAGE_TAG" .

echo "=== Done — image $IMAGE_TAG ready ==="
docker images "$IMAGE_TAG" --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'

# Clean up the binary in this dir (already inside the image)
rm -f "$BIN"
