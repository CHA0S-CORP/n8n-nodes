# syntax=docker/dockerfile:1

# ---- build stage: compile all packages ----
FROM node:22-alpine AS build
WORKDIR /repo
COPY . .
# --ignore-scripts skips n8n-workflow's isolated-vm native build (not needed to compile).
RUN npm install --ignore-scripts && npm run build

# ---- runtime stage: n8n with the nodes baked in ----
FROM n8nio/n8n:latest
USER root

# Lay the packages out under a single dir's node_modules and point
# N8N_CUSTOM_EXTENSIONS at that ONE dir. n8n loads every package it finds under
# <dir>/node_modules; a ';'-separated list of paths is unreliable (only one entry
# gets loaded), so a single parent dir is the robust way to ship multiple packages.
COPY --from=build /repo/packages/n8n-nodes-govee/dist         /opt/nodes/node_modules/n8n-nodes-govee/dist
COPY --from=build /repo/packages/n8n-nodes-govee/package.json /opt/nodes/node_modules/n8n-nodes-govee/package.json
COPY --from=build /repo/packages/n8n-nodes-rpitx/dist         /opt/nodes/node_modules/n8n-nodes-rpitx/dist
COPY --from=build /repo/packages/n8n-nodes-rpitx/package.json /opt/nodes/node_modules/n8n-nodes-rpitx/package.json
COPY --from=build /repo/packages/n8n-nodes-general-disarray/dist         /opt/nodes/node_modules/n8n-nodes-general-disarray/dist
COPY --from=build /repo/packages/n8n-nodes-general-disarray/package.json /opt/nodes/node_modules/n8n-nodes-general-disarray/package.json

# Install each package's production runtime deps. --omit=peer keeps n8n-workflow
# out of the package (n8n provides it at runtime), avoiding a duplicated copy.
RUN cd /opt/nodes/node_modules/n8n-nodes-govee && npm install --omit=dev --omit=peer --ignore-scripts --no-package-lock \
	&& cd /opt/nodes/node_modules/n8n-nodes-rpitx && npm install --omit=dev --omit=peer --ignore-scripts --no-package-lock \
	&& cd /opt/nodes/node_modules/n8n-nodes-general-disarray && npm install --omit=dev --omit=peer --ignore-scripts --no-package-lock \
	&& chown -R node:node /opt/nodes

USER node
ENV N8N_CUSTOM_EXTENSIONS=/opt/nodes
