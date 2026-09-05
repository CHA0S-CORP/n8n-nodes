import { createHash } from 'node:crypto';
import * as forge from 'node-forge';
import { v5 as uuidv5 } from 'uuid';
import type { IDataObject, IHttpRequestMethods } from 'n8n-workflow';

const APP_VERSION = '6.8.00';
const APP_UA = `GoveeHome/${APP_VERSION} (com.ihoment.GoVeeSensor; build:2; iOS 16.5.0) Alamofire/5.6.4`;

export interface IotSession {
	token: string;
	accountId: string;
	clientId: string;
	endpoint: string;
	certPem: string;
	keyPem: string;
	accountTopic: string;
	expiresAt: number;
}

/** Minimal http caller signature compatible with n8n's helpers.httpRequest. */
export type HttpRequest = (options: {
	method: IHttpRequestMethods;
	url: string;
	headers?: IDataObject;
	body?: IDataObject;
	json?: boolean;
}) => Promise<IDataObject>;

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, IotSession>();

function cacheKey(email: string): string {
	return createHash('sha256').update(email.toLowerCase()).digest('hex');
}

/**
 * Deterministic per-email client id (stable across runs so the cached session
 * and login stay consistent), namespaced to this package. govee2mqtt derives
 * its id as uuid5(email) — using the same value would give both processes the
 * same AWS IoT clientId, and AWS kicks the older session whenever a duplicate
 * connects, so they would disconnect each other in a loop.
 */
function deriveClientId(email: string): string {
	return uuidv5(`n8n-nodes-govee:${email.toLowerCase()}`, uuidv5.DNS).replace(/-/g, '');
}

/** Split a base64 PKCS#12 into PEM key + cert (port of extract_certificates). */
function p12ToPem(p12b64: string, password: string): { keyPem: string; certPem: string } {
	const der = forge.util.decode64(p12b64);
	const asn1 = forge.asn1.fromDer(der);
	const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

	let key: forge.pki.PrivateKey | undefined;
	const keyBags = {
		...p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }),
		...p12.getBags({ bagType: forge.pki.oids.keyBag }),
	};
	for (const oid of Object.keys(keyBags)) {
		for (const bag of keyBags[oid] ?? []) {
			if (bag.key) key = bag.key;
		}
	}

	let cert: forge.pki.Certificate | undefined;
	const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
	for (const bag of certBags[forge.pki.oids.certBag] ?? []) {
		if (bag.cert) cert = bag.cert;
	}

	if (!key || !cert) {
		throw new Error('Failed to extract private key/certificate from Govee p12.');
	}

	return {
		keyPem: forge.pki.privateKeyToPem(key),
		certPem: forge.pki.certificateToPem(cert),
	};
}

export async function getIotSession(
	http: HttpRequest,
	email: string,
	password: string,
	forceRefresh = false,
): Promise<IotSession> {
	const key = cacheKey(email);
	const cached = cache.get(key);
	if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
		return cached;
	}

	const clientId = deriveClientId(email);

	// 1. Login → token + accountId
	const login = (await http({
		method: 'POST',
		url: 'https://app2.govee.com/account/rest/account/v1/login',
		headers: { 'User-Agent': APP_UA, 'Content-Type': 'application/json', appVersion: APP_VERSION },
		body: { email, password, client: clientId },
		json: true,
	})) as IDataObject;

	if (login.status !== 200) {
		throw new Error(`Govee login failed: ${(login.message as string) ?? JSON.stringify(login)}`);
	}
	const client = login.client as IDataObject;
	const token = client.token as string;
	const accountId = String(client.accountId);
	// Devices publish their state to this per-account topic (e.g. "GA/...").
	const accountTopic = (client.topic as string) ?? '';

	// 2. Fetch IoT key (p12) + endpoint
	const iot = (await http({
		method: 'GET',
		url: 'https://app2.govee.com/app/v1/account/iot/key',
		headers: {
			Authorization: `Bearer ${token}`,
			appVersion: APP_VERSION,
			clientId,
			clientType: '1',
			iotVersion: '0',
			timestamp: Date.now().toString(),
			'User-Agent': APP_UA,
		},
		json: true,
	})) as IDataObject;

	if (iot.status !== 200) {
		throw new Error(`Govee iot/key failed: ${(iot.message as string) ?? JSON.stringify(iot)}`);
	}
	const data = iot.data as IDataObject;
	const { keyPem, certPem } = p12ToPem(data.p12 as string, data.p12Pass as string);

	const session: IotSession = {
		token,
		accountId,
		clientId,
		endpoint: data.endpoint as string,
		certPem,
		keyPem,
		accountTopic,
		expiresAt: Date.now() + TTL_MS,
	};
	cache.set(key, session);
	return session;
}

export function invalidateIotSession(email: string): void {
	cache.delete(cacheKey(email));
}
