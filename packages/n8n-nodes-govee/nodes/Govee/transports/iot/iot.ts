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
const STATE_TIMEOUT_MS = 5000;
const APP_UA = `GoveeHome/${APP_VERSION} (com.ihoment.GoVeeSensor; build:2; iOS 16.5.0) Alamofire/5.6.4`;

type Ctx = IExecuteFunctions | ILoadOptionsFunctions;

export class IotTransport implements GoveeTransport {
	private client?: MqttClient;

	private session?: IotSession;

	private txSeq = 0;

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

	/**
	 * Attach persistent listeners so an async broker/network error has a handler
	 * (an unhandled 'error' would crash the worker) and a dropped connection
	 * forces a fresh connect on next use.
	 */
	private attach(client: MqttClient): MqttClient {
		const drop = () => {
			if (this.client === client) this.client = undefined;
		};
		client.on('error', drop);
		client.on('close', drop);
		return client;
	}

	private async getClient(): Promise<MqttClient> {
		if (this.client) return this.client;
		// Resolve the session outside the retry so a login failure (bad credentials)
		// propagates as-is instead of triggering a second wasteful login attempt.
		const session = await this.getSession();
		try {
			this.client = this.attach(await connectIot(session));
			return this.client;
		} catch (error) {
			// Only reached if the MQTT connect itself failed — cert may be stale.
			// Re-auth once and retry the connection.
			invalidateIotSession(this.email);
			const fresh = await this.getSession(true);
			this.client = this.attach(await connectIot(fresh));
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

	private async publish(
		client: MqttClient,
		device: GoveeDevice,
		cmd: string,
		data: IDataObject,
	): Promise<void> {
		const topic = this.topicFor(device);
		const transaction = `v_${Date.now()}_${this.txSeq++}`;
		const message = {
			msg: { cmd, data, cmdVersion: 0, transaction, type: 1 },
		};
		await publishJson(client, topic, message);
	}

	private async send(device: GoveeDevice, cmd: string, data: IDataObject): Promise<IDataObject> {
		const client = await this.getClient();
		await this.publish(client, device, cmd, data);
		return { published: true, device: device.id, cmd, data };
	}

	/**
	 * Request the device's state and wait for its reply. Devices answer on the
	 * account-wide topic (shared by every device on the account), so replies are
	 * matched by the `device` field rather than per-request correlation.
	 */
	async getState(device: GoveeDevice): Promise<IDataObject> {
		const client = await this.getClient();
		const session = await this.getSession();
		const accountTopic = session.accountTopic;
		// Resolve the device topic up front so a missing topic throws synchronously
		// instead of inside the subscribe callback.
		this.topicFor(device);
		if (!accountTopic) {
			await this.publish(client, device, 'status', {});
			return {
				published: true,
				device: device.id,
				note: 'Govee login returned no account topic; state reply could not be awaited.',
			};
		}

		return new Promise<IDataObject>((resolve, reject) => {
			let settled = false;
			const finish = (fn: () => void) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				client.removeListener('message', onMessage);
				client.unsubscribe(accountTopic, () => undefined);
				fn();
			};

			const timer = setTimeout(
				() =>
					finish(() =>
						reject(
							new NodeOperationError(
								this.ctx.getNode(),
								`No IoT status reply from ${device.id} within ${STATE_TIMEOUT_MS} ms. Is the device online?`,
							),
						),
					),
				STATE_TIMEOUT_MS,
			);

			const onMessage = (topic: string, buf: Buffer) => {
				if (topic !== accountTopic) return;
				try {
					const payload = JSON.parse(buf.toString()) as IDataObject;
					const msg = (payload.msg as IDataObject | undefined) ?? {};
					const from = (payload.device ?? msg.device) as string | undefined;
					if (from !== device.id) return;
					finish(() => resolve(payload));
				} catch {
					// not JSON / not for us
				}
			};

			client.on('message', onMessage);
			client.subscribe(accountTopic, { qos: 0 }, (err) => {
				if (err) return finish(() => reject(err));
				this.publish(client, device, 'status', {}).catch((e: Error) => finish(() => reject(e)));
			});
		});
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
