import { NodeApiError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { v4 as uuidv4 } from 'uuid';
import type { GoveeDevice, GoveeTransport, Rgb } from './types';
import { rgbToInt } from '../GenericFunctions';

const BASE_URL = 'https://openapi.api.govee.com/router/api/v1';

type Ctx = IExecuteFunctions | ILoadOptionsFunctions;

interface CloudCapability {
	type: string;
	instance: string;
	value: unknown;
}

export class CloudTransport implements GoveeTransport {
	constructor(private ctx: Ctx) {}

	private async request(
		method: 'GET' | 'POST',
		resource: string,
		body?: IDataObject,
	): Promise<IDataObject> {
		let response: IDataObject;
		try {
			response = (await this.ctx.helpers.httpRequestWithAuthentication.call(this.ctx, 'goveeApi', {
				method,
				url: `${BASE_URL}${resource}`,
				body,
				json: true,
			})) as IDataObject;
		} catch (error) {
			const status = Number(
				(error as { httpCode?: string; statusCode?: number }).httpCode ??
					(error as { statusCode?: number }).statusCode,
			);
			if (status === 429) {
				throw new NodeApiError(this.ctx.getNode(), error as JsonObject, {
					message:
						'Govee Cloud API rate limit hit (max 10 requests/minute per device, 10000/day).',
				});
			}
			throw new NodeApiError(this.ctx.getNode(), error as JsonObject);
		}

		// Govee returns HTTP 200 with an in-body `code` for logical failures
		// (bad SKU, unsupported capability, offline device). Surface those as errors.
		if (typeof response.code === 'number' && response.code !== 200) {
			throw new NodeApiError(this.ctx.getNode(), response as JsonObject, {
				message: `Govee API error ${response.code}: ${(response.message as string) ?? 'request failed'}`,
			});
		}
		return response;
	}

	private async control(device: GoveeDevice, capability: CloudCapability): Promise<IDataObject> {
		return this.request('POST', '/device/control', {
			requestId: uuidv4(),
			payload: {
				sku: device.sku,
				device: device.id,
				capability,
			},
		});
	}

	async listDevices(): Promise<GoveeDevice[]> {
		const response = await this.request('GET', '/user/devices');
		const data = (response.data as IDataObject[]) ?? [];
		return data.map((d) => ({
			id: d.device as string,
			sku: d.sku as string,
			name: (d.deviceName as string) ?? (d.device as string),
			raw: d,
		}));
	}

	async listScenes(device: GoveeDevice): Promise<IDataObject[]> {
		const response = await this.request('POST', '/device/scenes', {
			requestId: uuidv4(),
			payload: { sku: device.sku, device: device.id },
		});
		const capabilities = (response.payload as IDataObject)?.capabilities as IDataObject[];
		const options =
			((capabilities?.[0]?.parameters as IDataObject)?.options as IDataObject[]) ?? [];
		return options;
	}

	async getState(device: GoveeDevice): Promise<IDataObject> {
		return this.request('POST', '/device/state', {
			requestId: uuidv4(),
			payload: { sku: device.sku, device: device.id },
		});
	}

	async setPower(device: GoveeDevice, on: boolean): Promise<IDataObject> {
		return this.control(device, {
			type: 'devices.capabilities.on_off',
			instance: 'powerSwitch',
			value: on ? 1 : 0,
		});
	}

	async setBrightness(device: GoveeDevice, value: number): Promise<IDataObject> {
		return this.control(device, {
			type: 'devices.capabilities.range',
			instance: 'brightness',
			value,
		});
	}

	async setColor(device: GoveeDevice, rgb: Rgb): Promise<IDataObject> {
		return this.control(device, {
			type: 'devices.capabilities.color_setting',
			instance: 'colorRgb',
			value: rgbToInt(rgb),
		});
	}

	async setColorTemp(device: GoveeDevice, kelvin: number): Promise<IDataObject> {
		return this.control(device, {
			type: 'devices.capabilities.color_setting',
			instance: 'colorTemperatureK',
			value: kelvin,
		});
	}

	async setScene(device: GoveeDevice, sceneValue: unknown): Promise<IDataObject> {
		return this.control(device, {
			type: 'devices.capabilities.dynamic_scene',
			instance: 'lightScene',
			value: sceneValue,
		});
	}

	async rawCommand(device: GoveeDevice, payload: IDataObject): Promise<IDataObject> {
		// payload is the capability object: { type, instance, value }
		return this.control(device, payload as unknown as CloudCapability);
	}
}
