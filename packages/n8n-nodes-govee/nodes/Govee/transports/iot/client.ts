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

		let settled = false;
		const fail = (err: Error) => {
			if (settled) return;
			settled = true;
			client.end(true);
			reject(err);
		};
		const onError = (err: Error) => fail(err);
		// With reconnectPeriod: 0 a broker that drops the TCP session without a
		// CONNACK (stale cert, policy denial, duplicate clientId) emits only
		// 'close' — no 'error', no 'connect' — so this must reject too, or the
		// promise never settles and the execution hangs.
		const onClose = () =>
			fail(new Error(`MQTT connection to ${session.endpoint} closed before CONNACK`));

		client.once('error', onError);
		client.once('close', onClose);
		client.once('connect', () => {
			settled = true;
			client.removeListener('error', onError);
			client.removeListener('close', onClose);
			resolve(client);
		});
	});
}

export function publishJson(client: MqttClient, topic: string, payload: unknown): Promise<void> {
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
