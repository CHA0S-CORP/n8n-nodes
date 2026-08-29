# Contributing

This repo is a monorepo of n8n community node packages. It is optimized for
incremental additions — including by LLM agents. Read this before adding code.

## Layout

```
packages/
  n8n-nodes-govee/     one publishable npm package = one or more related nodes
  n8n-nodes-rpitx/
scripts/copy-icons.js  shared, zero-dep icon copier used by every package build
Dockerfile             bakes all packages into an n8n image
.github/workflows/ci.yml
```

Each package is self-contained: its own `package.json`, `tsconfig.json`,
`.eslintrc.js`, `credentials/`, `nodes/`, and `dist/` (git-ignored).

## Ground rules

- **One concern per package.** A package maps to one integration (a vendor, a
  device, a service). Multiple related nodes may live in one package.
- **Programmatic nodes.** These nodes use sockets / MQTT / multi-step auth, so
  they are written in the programmatic style (a `class implements INodeType`
  with an `execute()` method), not the declarative/routing style.
- **No secrets, ever.** Never commit API keys, passwords, certs, or `.env`.
  Local test credential files must match a `.gitignore` pattern
  (`.creds-import.json`, `*.creds.json`). CI and reviewers will reject leaks.
- **`n8n-workflow` is a peer dependency**, never a runtime `dependency`. n8n
  provides it at runtime. Only add real third-party libs to `dependencies`
  (e.g. Govee needs `mqtt`, `node-forge`, `uuid`; Rpitx needs none).

## Adding a new node package

1. `mkdir -p packages/n8n-nodes-<name>/{credentials,nodes}` and copy an existing
   package's `package.json`, `tsconfig.json`, `.eslintrc.js`, `.prettierrc.js`,
   and `LICENSE` as a starting point.
2. In the new `package.json` set: `name` (`n8n-nodes-<name>`, must start with
   `n8n-nodes-`), `repository.directory`, and the `n8n` section listing the
   compiled `dist/...` paths for your nodes and credentials.
3. Keep the build script exactly `tsc && node ../../scripts/copy-icons.js`.
4. Put a `<name>.svg` icon next to the node and reference it as
   `icon: 'file:<name>.svg'`.
5. Add the package to the table in the root `README.md`.
6. Wire it into the image: add `COPY`/`npm install` lines in `Dockerfile` and
   extend `N8N_CUSTOM_EXTENSIONS`.

## Build, lint, test

```bash
npm install --ignore-scripts   # REQUIRED: skips n8n-workflow's isolated-vm
                               # native build, which we don't need for typing
npm run build                  # all packages
npm run lint                   # all packages
npm run build -w n8n-nodes-govee   # single package
```

`--ignore-scripts` is deliberate: we only consume `n8n-workflow`'s TypeScript
types at build time, and its `isolated-vm` dependency fails to compile on newer
Node versions. The real runtime is provided by the n8n host.

Lint must be clean (`eslint-plugin-n8n-nodes-base`). If a rule is genuinely
wrong for a case, disable it narrowly in that package's `.eslintrc.js` with a
comment explaining why — don't blanket-disable.

## Verifying against a real n8n

```bash
export N8N_CUSTOM_EXTENSIONS="$PWD/packages/n8n-nodes-govee:$PWD/packages/n8n-nodes-rpitx"
npx n8n start   # nodes appear in the editor
```

Or build the baked image: `docker build -t n8n-chaos . && docker run -p 5678:5678 n8n-chaos`.

## CI

Every push/PR runs build + lint for all packages and builds the Docker image.
Pushes to `main` also publish the image to GHCR. Keep CI green — a red build
blocks merging.
