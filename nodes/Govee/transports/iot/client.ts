import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { IotSession } from './auth';

/**
 * Connect to Govee's AWS IoT endpoint over mTLS. Amazon's root CA is in the
 * default Node trust store, so no bundled CA is required.
 */
export function connectIot(session: IotSession): Promise<MqttClient> {
	return new Promise((resolve, reject) => {
		const client = mqtt.connect(`mqtts://${session.endpoint}:8883`, {
			clientId: `AP/${session.accountId}/${session.clientId}`,
			cert: session.certPem,
			key: session.keyPem,
			protocolVersion: 4,
			rejectUnauthorized: true,
			connectTimeout: 10000,
			reconnectPeriod: 0,
		});

		const onError = (err: Error) => {
			client.end(true);
			reject(err);
		};

		client.once('error', onError);
		client.once('connect', () => {
			client.removeListener('error', onError);
			resolve(client);
		});
	});
}

export function publishJson(
	client: MqttClient,
	topic: string,
	payload: unknown,
): Promise<void> {
	return new Promise((resolve, reject) => {
		client.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => {
			if (err) reject(err);
			else resolve();
		});
	});
}

export function endClient(client: MqttClient): Promise<void> {
	return new Promise((resolve) => client.end(false, {}, () => resolve()));
}
