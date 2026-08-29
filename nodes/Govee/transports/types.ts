import type { IDataObject } from 'n8n-workflow';

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

/**
 * Normalized device across all three transports.
 * `id` is the canonical device identifier:
 *   - cloud/iot: the MAC-style device string (e.g. "AB:CD:...")
 *   - lan: the device IP address
 */
export interface GoveeDevice {
	id: string;
	sku: string;
	name: string;
	/** Transport-specific extras (LAN ip, IoT topic, cloud capabilities, ...). */
	raw?: IDataObject;
}

export interface GoveeTransport {
	listDevices(): Promise<GoveeDevice[]>;
	getState(device: GoveeDevice): Promise<IDataObject>;
	setPower(device: GoveeDevice, on: boolean): Promise<IDataObject>;
	setBrightness(device: GoveeDevice, value: number): Promise<IDataObject>;
	setColor(device: GoveeDevice, rgb: Rgb): Promise<IDataObject>;
	setColorTemp(device: GoveeDevice, kelvin: number): Promise<IDataObject>;
	/** Cloud only. */
	setScene?(device: GoveeDevice, sceneValue: unknown): Promise<IDataObject>;
	rawCommand(device: GoveeDevice, payload: IDataObject): Promise<IDataObject>;
	/** Release sockets / MQTT connections. Called in a finally block. */
	close?(): Promise<void>;
}
