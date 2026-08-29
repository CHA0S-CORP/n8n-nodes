import type { MqttClient } from 'mqtt';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import type { GoveeDevice, GoveeTransport, Rgb } from '../types';
import { getIotSession, invalidateIotSession } from './auth';
import type { HttpRequest, IotSession } from './auth';
import { connectIot, endClient, publishJson } from './client';

const APP_VERSION = '6.8.00';
const APP_UA = `GoveeHome/${APP_VERSION} (com.ihoment.GoVeeSensor; build:2; iOS 16.5.0) Alamofire/5.6.4`;

type Ctx = IExecuteFunctions | ILoadOptionsFunctions;

export class IotTransport implements GoveeTransport {
	private client?: MqttClient;

	private session?: IotSession;

	constructor(
		private ctx: Ctx,
		private email: string,
		private password: string,
	) {}

	/** Bound n8n http helper matching auth.ts's HttpRequest signature. */
	private http: HttpRequest = (options) =>
		this.ctx.helpers.httpRequest.call(this.ctx, {
			method: options.method as IHttpRequestMethods,
			url: options.url,
			headers: options.headers,
			body: options.body,
			json: options.json,
		}) as Promise<IDataObject>;

	private async getSession(forceRefresh = false): Promise<IotSession> {
		if (!this.session || forceRefresh) {
			this.session = await getIotSession(this.http, this.email, this.password, forceRefresh);
		}
		return this.session;
	}

	private async getClient(): Promise<MqttClient> {
		if (this.client) return this.client;
		try {
			const session = await this.getSession();
			this.client = await connectIot(session);
			return this.client;
		} catch (error) {
			// Cert may be stale — re-auth once, then retry.
			invalidateIotSession(this.email);
			const session = await this.getSession(true);
			this.client = await connectIot(session);
			return this.client;
		}
	}

	async listDevices(): Promise<GoveeDevice[]> {
		const session = await this.getSession();
		let response: IDataObject;
		try {
			response = (await this.http({
				method: 'POST',
				url: 'https://app2.govee.com/device/rest/devices/v1/list',
				headers: {
					Authorization: `Bearer ${session.token}`,
					appVersion: APP_VERSION,
					clientId: session.clientId,
					clientType: '1',
					iotVersion: '0',
					timestamp: Date.now().toString(),
					'User-Agent': APP_UA,
				},
				json: true,
			})) as IDataObject;
		} catch (error) {
			throw new NodeApiError(this.ctx.getNode(), error as JsonObject);
		}

		const devices = (response.devices as IDataObject[]) ?? [];
		return devices.map((d) => {
			const ext = (d.deviceExt as IDataObject) ?? {};
			let topic = '';
			try {
				const settings = JSON.parse((ext.deviceSettings as string) ?? '{}') as IDataObject;
				topic = (settings.topic as string) ?? '';
			} catch {
				// no topic available
			}
			return {
				id: d.device as string,
				sku: d.sku as string,
				name: (d.deviceName as string) ?? (d.device as string),
				raw: { ...d, topic },
			};
		});
	}

	private topicFor(device: GoveeDevice): string {
		const topic = (device.raw?.topic as string) ?? '';
		if (!topic) {
			throw new NodeOperationError(
				this.ctx.getNode(),
				`No IoT topic known for device ${device.id}. Select it from the device list so its topic is resolved.`,
			);
		}
		return topic;
	}

	private async send(device: GoveeDevice, cmd: string, data: IDataObject): Promise<IDataObject> {
		const client = await this.getClient();
		const topic = this.topicFor(device);
		const transaction = `v_${Date.now()}000`;
		const message = {
			msg: { cmd, data, cmdVersion: 0, transaction, type: 1 },
		};
		await publishJson(client, topic, message);
		return { published: true, device: device.id, cmd, data };
	}

	async getState(device: GoveeDevice): Promise<IDataObject> {
		// Fire a status request; replies arrive on the account topic asynchronously.
		// We publish and report the request rather than block, since Govee's IoT
		// status replies are not reliably correlated per-request.
		return this.send(device, 'status', {});
	}

	async setPower(device: GoveeDevice, on: boolean): Promise<IDataObject> {
		return this.send(device, 'turn', { val: on ? 1 : 0 });
	}

	async setBrightness(device: GoveeDevice, value: number): Promise<IDataObject> {
		return this.send(device, 'brightness', { val: value });
	}

	async setColor(device: GoveeDevice, rgb: Rgb): Promise<IDataObject> {
		return this.send(device, 'colorwc', {
			color: { r: rgb.r, g: rgb.g, b: rgb.b },
			colorTemInKelvin: 0,
		});
	}

	async setColorTemp(device: GoveeDevice, kelvin: number): Promise<IDataObject> {
		return this.send(device, 'colorwc', {
			color: { r: 0, g: 0, b: 0 },
			colorTemInKelvin: kelvin,
		});
	}

	async rawCommand(device: GoveeDevice, payload: IDataObject): Promise<IDataObject> {
		const cmd = payload.cmd as string;
		const data = (payload.data as IDataObject) ?? {};
		if (!cmd) {
			throw new NodeOperationError(
				this.ctx.getNode(),
				'IoT raw command requires a "cmd" field (e.g. {"cmd":"turn","data":{"val":1}}).',
			);
		}
		return this.send(device, cmd, data);
	}

	async close(): Promise<void> {
		if (this.client) {
			await endClient(this.client);
			this.client = undefined;
		}
	}
}
