# n8n-nodes-govee

An [n8n](https://n8n.io) community node to control **Govee LED devices** through three
transports, selectable per node execution:

| Connection | Auth | Notes |
|---|---|---|
| **Cloud API** | Govee developer API key | Official, documented, reliable. Recommended. |
| **LAN (UDP)** | none | Local control. Requires *LAN Control* enabled and n8n on the same subnet. |
| **App IoT (MQTT)** | Govee account email/password | Undocumented app channel via AWS IoT. May break without notice. |

## Operations

Get Devices · Get State · Set Power · Set Brightness · Set Color (RGB) ·
Set Color Temperature · Set Scene *(Cloud only)* · Raw Command.

Devices are chosen from a searchable dropdown (populated from the active connection)
or entered by ID (MAC-style string for Cloud/IoT, IP address for LAN).

## Credentials

- **Govee API** — API key. Request it in the Govee Home app: *Profile → About Us → Apply for API Key*.
- **Govee App Account** — the email/password of your Govee Home login. Used only for the
  IoT connection. The node logs in, fetches an AWS IoT mTLS certificate, and caches it
  in memory (per process, 24 h) to avoid repeated logins, which Govee rate-limits.

## Install

Community nodes: **Settings → Community Nodes → Install** `n8n-nodes-govee`.

### Local development

```bash
npm install
npm run build      # tsc + copy icons
npm run lint
npm link
mkdir -p ~/.n8n/custom && (cd ~/.n8n/custom && npm link n8n-nodes-govee)
npx n8n start      # the "Govee" node appears in the editor
```

Use `npm run dev` (tsc watch) and restart n8n to iterate.

## Raw Command payloads

- **Cloud**: a capability object — `{"type":"devices.capabilities.on_off","instance":"powerSwitch","value":1}`
- **LAN**: `{"cmd":"turn","data":{"value":1}}`
- **IoT**: `{"cmd":"turn","data":{"val":1}}`

## Caveats & limits

- **Cloud** rate limits: 10 requests/minute per device, 10 000/day. A 429 surfaces a clear error.
- **LAN** needs *LAN Control* toggled on in the Govee Home app, the device on the same
  L2 subnet as n8n (multicast `239.255.255.250`, UDP 4001/4002/4003), and is only
  supported on some SKUs. `Get State` times out after 3 s if no reply.
- **IoT** is a reverse-engineered channel and can break when Govee updates their app API.
  `Get State` publishes a status request but does not block on the async reply. In n8n
  queue mode, each worker maintains its own certificate cache (extra logins).

## License

MIT
