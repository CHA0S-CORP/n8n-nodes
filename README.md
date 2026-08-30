# CHA0S-CORP n8n nodes

Monorepo of [n8n](https://n8n.io) community node packages. Each package under
`packages/` is independently versioned and publishable.

| Package | What it does |
|---|---|
| [`n8n-nodes-govee`](packages/n8n-nodes-govee) | Control Govee LEDs via Cloud API, LAN UDP, or the app AWS IoT (MQTT) channel. Includes an ordered *Run Actions* batch operation. |
| [`n8n-nodes-rpitx`](packages/n8n-nodes-rpitx) | Control an Rpitx dashboard. |
| [`n8n-nodes-general-disarray`](packages/n8n-nodes-general-disarray) | Drive the [General Disarray](https://github.com/CHA0S-CORP/general-disarray) SIP AI phone assistant: place calls, collect choices, speak, run tools, schedule, virtual numbers, plus a webhook trigger for call events. (AGPL-3.0) |

## Development

Uses npm workspaces.

```bash
# --ignore-scripts skips n8n-workflow's isolated-vm native build, which fails on
# newer Node and isn't needed — we only consume its TypeScript types.
npm install --ignore-scripts   # installs all packages (deps hoisted to root)
npm run build                  # build every package
npm run lint                   # lint every package

# work on a single package
npm run build -w n8n-nodes-govee
```

### Loading into a local n8n

Easiest — build the baked image and run it with Docker Compose:

```bash
docker compose up --build       # rebuild after changing node code
# open http://localhost:5678
```

Or point a local n8n at a single dir whose `node_modules` links every package.
n8n loads all packages under one custom-extensions dir; a `;`-separated list of
multiple dirs is unreliable (only one entry loads), so use one parent dir:

```bash
npm run build
mkdir -p .n8ncustom/node_modules
for p in n8n-nodes-govee n8n-nodes-rpitx n8n-nodes-general-disarray; do
  ln -sf "$PWD/packages/$p" ".n8ncustom/node_modules/$p"
done
export N8N_CUSTOM_EXTENSIONS="$PWD/.n8ncustom"
n8n start
```

## License

MIT — see [LICENSE](LICENSE). Exception: `n8n-nodes-general-disarray` is AGPL-3.0, matching the General Disarray project it was extracted from (see its `package.json`).
