import * as dgram from 'node:dgram';
import { NodeOperationError } from 'n8n-workflow';
import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import type { GoveeDevice, GoveeTransport, Rgb } from './types';

const MULTICAST_ADDR = '239.255.255.250';
const SCAN_PORT = 4001; // device listens for scan/control multicast
const RECV_PORT = 4002; // device replies here
const CMD_PORT = 4003; // per-device unicast command port

type Ctx = IExecuteFunctions | ILoadOptionsFunctions;

interface ScanReply extends IDataObject {
	ip: string;
	device: string;
	sku: string;
}

/**
 * Govee LAN control. NOTE: `scan()` and `getState()` bind the fixed protocol
 * port 4002 to receive replies, so two of these running concurrently in the same
 * process (parallel branches / two Govee nodes) will contend for that port and
 * one may time out. Run LAN state/scan operations serially within a process.
 */
export class LanTransport implements GoveeTransport {
	constructor(
		private ctx: Ctx,
		private scanTimeoutMs = 2000,
		private stateTimeoutMs = 3000,
	) {}

	/** Send a one-shot UDP command to a device; does not wait for a reply. */
	private sendCommand(ip: string, cmd: string, data: IDataObject): Promise<IDataObject> {
		return new Promise((resolve, reject) => {
			const socket = dgram.createSocket('udp4');
			const message = Buffer.from(JSON.stringify({ msg: { cmd, data } }));
			socket.send(message, CMD_PORT, ip, (err) => {
				socket.close();
				if (err) reject(err);
				else resolve({ sent: true, ip, cmd, data });
			});
		});
	}

	async listDevices(): Promise<GoveeDevice[]> {
		const replies = await this.scan();
		return replies.map((r) => ({
			id: r.ip,
			sku: r.sku,
			name: `${r.sku} (${r.ip})`,
			raw: r,
		}));
	}

	private scan(): Promise<ScanReply[]> {
		return new Promise((resolve, reject) => {
			const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
			const found = new Map<string, ScanReply>();

			socket.on('error', (err) => {
				socket.close();
				reject(err);
			});

			socket.on('message', (buf) => {
				try {
					const parsed = JSON.parse(buf.toString()) as { msg?: { cmd?: string; data?: ScanReply } };
					if (parsed.msg?.cmd === 'scan' && parsed.msg.data?.ip) {
						found.set(parsed.msg.data.ip, parsed.msg.data);
					}
				} catch {
					// ignore non-JSON / unrelated SSDP traffic on this port
				}
			});

			socket.bind(RECV_PORT, () => {
				const scanMsg = Buffer.from(
					JSON.stringify({ msg: { cmd: 'scan', data: { account_topic: 'reserve' } } }),
				);
				socket.send(scanMsg, SCAN_PORT, MULTICAST_ADDR, (err) => {
					if (err) {
						socket.close();
						reject(err);
					}
				});
			});

			setTimeout(() => {
				socket.close();
				resolve([...found.values()]);
			}, this.scanTimeoutMs);
		});
	}

	async getState(device: GoveeDevice): Promise<IDataObject> {
		return new Promise((resolve, reject) => {
			const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
			let settled = false;

			const finish = (fn: () => void) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				socket.close();
				fn();
			};

			const timer = setTimeout(() => {
				finish(() =>
					reject(
						new NodeOperationError(
							this.ctx.getNode(),
							`No LAN reply from ${device.id}. Is "LAN Control" enabled in the Govee Home app and the device on this subnet?`,
						),
					),
				);
			}, this.stateTimeoutMs);

			socket.on('error', (err) => finish(() => reject(err)));

			socket.on('message', (buf, rinfo) => {
				// The socket is bound to the shared RECV_PORT, so ignore replies from
				// any other device that happens to broadcast a status at the same time.
				if (rinfo.address !== device.id) return;
				try {
					const parsed = JSON.parse(buf.toString()) as { msg?: { cmd?: string; data?: IDataObject } };
					if (parsed.msg?.cmd === 'devStatus') {
						finish(() => resolve(parsed.msg!.data ?? {}));
					}
				} catch {
					// ignore
				}
			});

			socket.bind(RECV_PORT, () => {
				const msg = Buffer.from(JSON.stringify({ msg: { cmd: 'devStatus', data: {} } }));
				socket.send(msg, CMD_PORT, device.id, (err) => {
					if (err) finish(() => reject(err));
				});
			});
		});
	}

	async setPower(device: GoveeDevice, on: boolean): Promise<IDataObject> {
		return this.sendCommand(device.id, 'turn', { value: on ? 1 : 0 });
	}

	async setBrightness(device: GoveeDevice, value: number): Promise<IDataObject> {
		return this.sendCommand(device.id, 'brightness', { value });
	}

	async setColor(device: GoveeDevice, rgb: Rgb): Promise<IDataObject> {
		return this.sendCommand(device.id, 'colorwc', {
			color: { r: rgb.r, g: rgb.g, b: rgb.b },
			colorTemInKelvin: 0,
		});
	}

	async setColorTemp(device: GoveeDevice, kelvin: number): Promise<IDataObject> {
		return this.sendCommand(device.id, 'colorwc', {
			color: { r: 0, g: 0, b: 0 },
			colorTemInKelvin: kelvin,
		});
	}

	async rawCommand(device: GoveeDevice, payload: IDataObject): Promise<IDataObject> {
		// payload = { cmd: string, data: object }
		const cmd = payload.cmd as string;
		const data = (payload.data as IDataObject) ?? {};
		if (!cmd) {
			throw new NodeOperationError(
				this.ctx.getNode(),
				'LAN raw command requires a "cmd" field (e.g. {"cmd":"turn","data":{"value":1}}).',
			);
		}
		return this.sendCommand(device.id, cmd, data);
	}
}
