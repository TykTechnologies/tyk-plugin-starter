# Build the goja-enabled Tyk OSS gateway by overlaying a freshly-built binary
# onto the published Tyk image. The published image supplies templates, working
# directories, and runtime config; the new binary supplies the goja JS engine
# (which the published v5.x doesn't yet ship — that's the open PR).
#
# Build context: the Tyk gateway source repo (not this directory). Pass the
# linux binary as a build arg path that the build copies into the image.
#
# When the goja branch merges into main and a public image with goja support
# ships (e.g. tykio/tyk-gateway:v5.13+), delete this Dockerfile and switch the
# compose file's `image:` directive to that tag.

ARG BASE_IMAGE=tykio/tyk-gateway:v5.7
FROM ${BASE_IMAGE}

ARG TYK_BINARY=tyk-linux
COPY --chmod=0755 ${TYK_BINARY} /opt/tyk-gateway/tyk
