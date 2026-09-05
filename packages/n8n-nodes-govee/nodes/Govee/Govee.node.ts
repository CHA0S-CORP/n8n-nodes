import { NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { goveeProperties } from './descriptions';
import { parseColor } from './GenericFunctions';
import type { GoveeDevice, GoveeTransport } from './transports/types';
import { CloudTransport } from './transports/cloud';
import { LanTransport } from './transports/lan';
import { IotTransport } from './transports/iot/iot';

type Ctx = IExecuteFunctions | ILoadOptionsFunctions;

async function buildTransport(ctx: Ctx, connection: string): Promise<GoveeTransport> {
	if (connection === 'cloud') {
		return new CloudTransport(ctx);
	}
	if (connection === 'lan') {
		return new LanTransport(ctx);
	}
	if (connection === 'iot') {
		const creds = await ctx.getCredentials('goveeApp');
		return new IotTransport(ctx, creds.email as string, creds.password as string);
	}
	throw new NodeOperationError(ctx.getNode(), `Unknown connection "${connection}"`);
}

interface ActionSpec {
	type: string;
	powerState?: string;
	brightness?: number;
	color?: string;
	colorTemp?: number;
	sceneValue?: string;
}

/** Apply a single action from a Run Actions list. Shared with the single-op path. */
async function applyAction(
	transport: GoveeTransport,
	ctx: IExecuteFunctions,
	device: GoveeDevice,
	act: ActionSpec,
): Promise<IDataObject> {
	switch (act.type) {
		case 'power':
			return transport.setPower(device, act.powerState === 'on');
		case 'brightness':
			return transport.setBrightness(device, act.brightness as number);
		case 'color':
			return transport.setColor(device, parseColor(ctx.getNode(), act.color as string));
		case 'colorTemp':
			return transport.setColorTemp(device, act.colorTemp as number);
		case 'scene': {
			if (!transport.setScene) {
				throw new NodeOperationError(
					ctx.getNode(),
					'Scene action is only available on the Cloud API connection.',
				);
			}
			let value: unknown = act.sceneValue;
			try {
				value = JSON.parse(act.sceneValue ?? '');
			} catch {
				// use raw string value
			}
			return transport.setScene(device, value);
		}
		default:
			throw new NodeOperationError(ctx.getNode(), `Unknown action type "${act.type}"`);
	}
}

/** Resolve the `device` resourceLocator (list JSON or manual id) into a GoveeDevice. */
function resolveDevice(ctx: IExecuteFunctions, i: number): GoveeDevice {
	const rl = ctx.getNodeParameter('device', i) as { mode: string; value: string };
	const value = rl.value;

	// List mode encodes {id, sku, name, topic?} as JSON.
	try {
		const parsed = JSON.parse(value) as Partial<GoveeDevice>;
		if (parsed && typeof parsed === 'object' && parsed.id) {
			return {
				id: parsed.id,
				sku: parsed.sku ?? '',
				name: parsed.name ?? parsed.id,
				raw: parsed.raw ?? (parsed as IDataObject),
			};
		}
	} catch {
		// manual id — fall through
	}

	const sku = (ctx.getNodeParameter('sku', i, '') as string) || '';
	return { id: value, sku, name: value };
}

export class Govee implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Govee',
		name: 'govee',
		icon: 'file:govee.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + " (" + $parameter["connection"] + ")"}}',
		description: 'Control Govee LEDs via Cloud API, LAN UDP, or the app IoT channel',
		defaults: { name: 'Govee' },
		usableAsTool: true,
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'goveeApi',
				required: true,
				displayOptions: { show: { connection: ['cloud'] } },
			},
			{
				name: 'goveeApp',
				required: true,
				displayOptions: { show: { connection: ['iot'] } },
			},
		],
		properties: goveeProperties,
	};

	methods = {
		listSearch: {
			async searchDevices(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
				const connection = this.getCurrentNodeParameter('connection') as string;
				const transport = await buildTransport(this, connection);
				try {
					const devices = await transport.listDevices();
					return {
						results: devices.map((d) => ({
							name: d.name,
							value: JSON.stringify(d),
						})),
					};
				} finally {
					await transport.close?.();
				}
			},

			async searchScenes(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
				const rl = this.getCurrentNodeParameter('device') as { value: string } | undefined;
				if (!rl?.value) return { results: [] };
				let device: GoveeDevice;
				try {
					device = JSON.parse(rl.value) as GoveeDevice;
				} catch {
					const sku = (this.getCurrentNodeParameter('sku') as string) || '';
					device = { id: rl.value, sku, name: rl.value };
				}
				const transport = new CloudTransport(this);
				const scenes = await transport.listScenes(device);
				return {
					results: scenes.map((s) => ({
						name: (s.name as string) ?? String(s.value),
						value: JSON.stringify(s.value),
					})),
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const connection = this.getNodeParameter('connection', 0) as string;
		const transport = await buildTransport(this, connection);

		try {
			for (let i = 0; i < items.length; i++) {
				try {
					const operation = this.getNodeParameter('operation', i) as string;
					let result: IDataObject;

					if (operation === 'getDevices') {
						const devices = await transport.listDevices();
						for (const d of devices) {
							returnData.push({ json: d as unknown as IDataObject, pairedItem: { item: i } });
						}
						continue;
					}

					const device = resolveDevice(this, i);

					switch (operation) {
						case 'getState':
							result = await transport.getState(device);
							break;
						case 'setPower':
							result = await transport.setPower(
								device,
								(this.getNodeParameter('powerState', i) as string) === 'on',
							);
							break;
						case 'setBrightness':
							result = await transport.setBrightness(
								device,
								this.getNodeParameter('brightness', i) as number,
							);
							break;
						case 'setColor':
							result = await transport.setColor(
								device,
								parseColor(this.getNode(), this.getNodeParameter('color', i) as string),
							);
							break;
						case 'setColorTemp':
							result = await transport.setColorTemp(
								device,
								this.getNodeParameter('colorTemp', i) as number,
							);
							break;
						case 'setScene': {
							if (!transport.setScene) {
								throw new NodeOperationError(
									this.getNode(),
									'Set Scene is only available on the Cloud API connection.',
									{ itemIndex: i },
								);
							}
							const sceneRl = this.getNodeParameter('scene', i) as { value: string };
							let sceneValue: unknown = sceneRl.value;
							try {
								sceneValue = JSON.parse(sceneRl.value);
							} catch {
								// use raw string value
							}
							result = await transport.setScene(device, sceneValue);
							break;
						}
						case 'rawCommand': {
							const raw = this.getNodeParameter('rawPayload', i) as IDataObject | string;
							const payload = typeof raw === 'string' ? (JSON.parse(raw) as IDataObject) : raw;
							result = await transport.rawCommand(device, payload);
							break;
						}
						case 'runActions': {
							const coll = this.getNodeParameter('actions', i, {}) as {
								action?: ActionSpec[];
							};
							const actions = coll.action ?? [];
							const delay = this.getNodeParameter('actionDelay', i, 300) as number;
							const applied: IDataObject[] = [];
							try {
								for (let a = 0; a < actions.length; a++) {
									const res = await applyAction(transport, this, device, actions[a]);
									applied.push({ type: actions[a].type, result: res });
									if (delay > 0 && a < actions.length - 1) {
										await new Promise((r) => setTimeout(r, delay));
									}
								}
							} catch (error) {
								// Preserve which steps already succeeded before re-throwing, so a
								// mid-list failure doesn't hide the applied actions.
								const e = error as { context?: IDataObject };
								e.context = { ...(e.context ?? {}), device: device.id, applied };
								throw error;
							}
							result = { device: device.id, count: applied.length, actions: applied };
							break;
						}
						default:
							throw new NodeOperationError(
								this.getNode(),
								`Unknown operation "${operation}"`,
								{ itemIndex: i },
							);
					}

					returnData.push({ json: result, pairedItem: { item: i } });
				} catch (error) {
					if (this.continueOnFail()) {
						const ctx = (error as { context?: IDataObject }).context;
						returnData.push({
							json: { error: (error as Error).message, ...(ctx ? { ...ctx } : {}) },
							pairedItem: { item: i },
						});
						continue;
					}
					throw error;
				}
			}
		} finally {
			await transport.close?.();
		}

		return [returnData];
	}
}
