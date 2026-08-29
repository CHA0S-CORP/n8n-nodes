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

# Copy each package's compiled output + manifest into a custom-extensions dir.
COPY --from=build /repo/packages/n8n-nodes-govee/dist         /opt/nodes/n8n-nodes-govee/dist
COPY --from=build /repo/packages/n8n-nodes-govee/package.json /opt/nodes/n8n-nodes-govee/package.json
COPY --from=build /repo/packages/n8n-nodes-rpitx/dist         /opt/nodes/n8n-nodes-rpitx/dist
COPY --from=build /repo/packages/n8n-nodes-rpitx/package.json /opt/nodes/n8n-nodes-rpitx/package.json
COPY --from=build /repo/packages/n8n-nodes-general-disarray/dist         /opt/nodes/n8n-nodes-general-disarray/dist
COPY --from=build /repo/packages/n8n-nodes-general-disarray/package.json /opt/nodes/n8n-nodes-general-disarray/package.json

# Install each package's production runtime deps. --omit=peer is critical: without
# it npm would install n8n-workflow into the package, duplicating n8n's own copy and
# breaking instanceof checks / shared registries at runtime.
RUN cd /opt/nodes/n8n-nodes-govee && npm install --omit=dev --omit=peer --ignore-scripts --no-package-lock \
	&& cd /opt/nodes/n8n-nodes-rpitx && npm install --omit=dev --omit=peer --ignore-scripts --no-package-lock \
	&& cd /opt/nodes/n8n-nodes-general-disarray && npm install --omit=dev --omit=peer --ignore-scripts --no-package-lock \
	&& chown -R node:node /opt/nodes

USER node
ENV N8N_CUSTOM_EXTENSIONS=/opt/nodes/n8n-nodes-govee:/opt/nodes/n8n-nodes-rpitx:/opt/nodes/n8n-nodes-general-disarray
