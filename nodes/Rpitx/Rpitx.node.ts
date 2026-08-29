import { NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { rpitxProperties } from './descriptions';

/**
 * Upload a binary property from the current item to POST /api/upload and return
 * the host path the server stored it at (to feed back as audio_file/image_file).
 */
async function uploadBinary(
	ctx: IExecuteFunctions,
	baseUrl: string,
	i: number,
	prop: string,
): Promise<string> {
	const meta = ctx.helpers.assertBinaryData(i, prop);
	const buffer = await ctx.helpers.getBinaryDataBuffer(i, prop);
	const res = (await ctx.helpers.requestWithAuthentication.call(ctx, 'rpitxApi', {
		method: 'POST',
		uri: `${baseUrl}/api/upload`,
		formData: {
			file: {
				value: buffer,
				options: {
					filename: meta.fileName ?? 'upload.bin',
					contentType: meta.mimeType,
				},
			},
		},
		json: true,
	})) as IDataObject;
	return res.path as string;
}

export class Rpitx implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'rpitx',
		name: 'rpitx',
		icon: 'file:rpitx.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Control an rpibase-tx dashboard: start/stop and monitor rpitx RF transmissions',
		defaults: { name: 'rpitx' },
		usableAsTool: true,
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'rpitxApi', required: true }],
		properties: rpitxProperties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const creds = await this.getCredentials('rpitxApi');
		const baseUrl = (creds.baseUrl as string).replace(/\/+$/, '');

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				let method: IHttpRequestMethods = 'GET';
				let path = '';
				let body: IDataObject | undefined;

				switch (operation) {
					case 'status':
						path = '/api/status';
						break;
					case 'modes':
						path = '/api/modes';
						break;
					case 'stop':
						method = 'POST';
						path = '/api/stop';
						break;
					case 'broadcastFm': {
						method = 'POST';
						path = '/api/tx/pifmrds';
						const audioFile =
							(this.getNodeParameter('audioSource', i) as string) === 'upload'
								? await uploadBinary(this, baseUrl, i, this.getNodeParameter('binaryProperty', i) as string)
								: (this.getNodeParameter('audioFile', i) as string);
						body = {
							authorized: true,
							freq_hz: this.getNodeParameter('freqHz', i) as number,
							audio_file: audioFile,
						};
						const rds = this.getNodeParameter('rds', i, {}) as IDataObject;
						for (const [k, v] of Object.entries(rds)) {
							if (v !== '' && v !== undefined && v !== null) body[k] = v;
						}
						break;
					}
					case 'sendPocsag': {
						method = 'POST';
						path = '/api/tx/pocsag';
						body = {
							authorized: true,
							freq_hz: this.getNodeParameter('freqHz', i) as number,
							ric: this.getNodeParameter('ric', i) as number,
							message: this.getNodeParameter('message', i) as string,
							baud: this.getNodeParameter('baud', i) as number,
						};
						break;
					}
					case 'sendSstv': {
						method = 'POST';
						path = '/api/tx/pisstv';
						const imageFile =
							(this.getNodeParameter('imageSource', i) as string) === 'upload'
								? await uploadBinary(this, baseUrl, i, this.getNodeParameter('binaryProperty', i) as string)
								: (this.getNodeParameter('imageFile', i) as string);
						body = {
							authorized: true,
							freq_hz: this.getNodeParameter('freqHz', i) as number,
							image_file: imageFile,
						};
						break;
					}
					case 'start': {
						method = 'POST';
						const mode = this.getNodeParameter('mode', i) as string;
						path = `/api/tx/${mode}`;

						const params = this.getNodeParameter('params', i, {}) as IDataObject;
						// authorized is implied by invoking the node — the API just requires it.
						body = { freq_hz: this.getNodeParameter('freqHz', i) as number, authorized: true };
						// Forward only the mode params the user actually set.
						for (const [k, v] of Object.entries(params)) {
							if (v !== '' && v !== undefined && v !== null) body[k] = v;
						}
						break;
					}
					default:
						throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
							itemIndex: i,
						});
				}

				// Shared duration cap for every transmit operation.
				if (body && ['broadcastFm', 'sendPocsag', 'sendSstv', 'start'].includes(operation)) {
					const maxSeconds = this.getNodeParameter('maxSeconds', i, 0) as number;
					if (maxSeconds > 0) body.max_seconds = maxSeconds;
				}

				const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'rpitxApi', {
					method,
					url: `${baseUrl}${path}`,
					body,
					json: true,
				})) as IDataObject;

				returnData.push({ json: response, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
