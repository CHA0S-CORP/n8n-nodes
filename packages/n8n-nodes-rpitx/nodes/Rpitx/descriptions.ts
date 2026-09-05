import type { INodeProperties } from 'n8n-workflow';

// Operations that actually key the transmitter and therefore share the common
// frequency + duration controls.
const TX_OPS = ['broadcastFm', 'sendPocsag', 'sendSstv', 'start'];

export const rpitxProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'status',
		options: [
			{
				name: 'Broadcast FM (Audio)',
				value: 'broadcastFm',
				action: 'Broadcast an audio file over FM',
				description: 'Transmit an audio file as FM, optionally with RDS text (pifmrds)',
			},
			{
				name: 'Get Modes',
				value: 'modes',
				action: 'List available TX modes',
				description: 'Return the mode registry and each mode input schema',
			},
			{
				name: 'Get Status',
				value: 'status',
				action: 'Get the current transmission status',
				description: 'Return whether a transmission is running and its details',
			},
			{
				name: 'Send POCSAG Message',
				value: 'sendPocsag',
				action: 'Send a POCSAG pager message',
				description: 'Transmit a POCSAG page — just a frequency, capcode, and message',
			},
			{
				name: 'Send SSTV Image',
				value: 'sendSstv',
				action: 'Send an image over SSTV',
				description: 'Encode and transmit an image file as SSTV (pisstv)',
			},
			{
				name: 'Start Transmission',
				value: 'start',
				action: 'Start a transmission',
				description: 'Begin transmitting on any mode with raw parameters',
			},
			{
				name: 'Stop Transmission',
				value: 'stop',
				action: 'Stop the active transmission',
				description: 'Kill the currently running transmission',
			},
		],
	},

	// ---- Shared TX controls -------------------------------------------------
	{
		displayName: 'Frequency (Hz)',
		name: 'freqHz',
		type: 'number',
		default: 434000000,
		required: true,
		displayOptions: { show: { operation: TX_OPS } },
		description: 'Carrier frequency in Hz. Must fall inside the server frequency allow-list.',
	},

	// ---- Broadcast FM (Audio) ----------------------------------------------
	{
		displayName: 'Audio Source',
		name: 'audioSource',
		type: 'options',
		default: 'upload',
		displayOptions: { show: { operation: ['broadcastFm'] } },
		options: [
			{ name: 'Upload From Input', value: 'upload', description: 'Send binary data from an incoming item to the server' },
			{ name: 'Host Path', value: 'path', description: 'Use a file already present on the rpitx host' },
		],
		description: 'Where the audio comes from',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryProperty',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: { show: { operation: ['broadcastFm'], audioSource: ['upload'] } },
		description: 'Name of the binary property on the input item holding the audio file',
	},
	{
		displayName: 'Audio File',
		name: 'audioFile',
		type: 'string',
		default: '',
		required: true,
		placeholder: '/var/lib/rpitx-dashboard/song.wav',
		displayOptions: { show: { operation: ['broadcastFm'], audioSource: ['path'] } },
		description: 'Path (on the rpitx host) to the audio file to broadcast. WAV/raw as pifmrds expects.',
	},
	{
		displayName: 'RDS Options',
		name: 'rds',
		type: 'collection',
		placeholder: 'Add RDS Field',
		default: {},
		displayOptions: { show: { operation: ['broadcastFm'] } },
		description: 'Optional RDS text shown on receivers',
		options: [
			{
				displayName: 'RDS PS (Station Name)',
				name: 'rds_ps',
				type: 'string',
				default: 'RPITX',
				description: 'Program service name, max 8 characters',
			},
			{
				displayName: 'RDS Radiotext',
				name: 'rds_rt',
				type: 'string',
				default: '',
				description: 'Scrolling radiotext message',
			},
		],
	},

	// ---- Send POCSAG Message ------------------------------------------------
	{
		displayName: 'RIC (Capcode)',
		name: 'ric',
		type: 'number',
		default: 1,
		typeOptions: { minValue: 1 },
		required: true,
		displayOptions: { show: { operation: ['sendPocsag'] } },
		description: 'Receiver capcode of the target pager',
	},
	{
		displayName: 'Message',
		name: 'message',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { operation: ['sendPocsag'] } },
		description: 'Alphanumeric message body to page',
	},
	{
		displayName: 'Baud',
		name: 'baud',
		type: 'options',
		default: 1200,
		displayOptions: { show: { operation: ['sendPocsag'] } },
		options: [
			{ name: '512', value: 512 },
			{ name: '1200', value: 1200 },
			{ name: '2400', value: 2400 },
		],
		description: 'POCSAG baud rate',
	},

	// ---- Send SSTV Image ----------------------------------------------------
	{
		displayName: 'Image Source',
		name: 'imageSource',
		type: 'options',
		default: 'upload',
		displayOptions: { show: { operation: ['sendSstv'] } },
		options: [
			{ name: 'Upload From Input', value: 'upload', description: 'Send binary data from an incoming item to the server' },
			{ name: 'Host Path', value: 'path', description: 'Use a file already present on the rpitx host' },
		],
		description: 'Where the image comes from',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryProperty',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: { show: { operation: ['sendSstv'], imageSource: ['upload'] } },
		description: 'Name of the binary property on the input item holding the image file',
	},
	{
		displayName: 'Image File',
		name: 'imageFile',
		type: 'string',
		default: '',
		required: true,
		placeholder: '/var/lib/rpitx-dashboard/photo.png',
		displayOptions: { show: { operation: ['sendSstv'], imageSource: ['path'] } },
		description: 'Path (on the rpitx host) to the image to encode and transmit as SSTV',
	},

	// ---- Start Transmission (raw) ------------------------------------------
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		default: 'tune',
		displayOptions: { show: { operation: ['start'] } },
		options: [
			{ name: 'Chirp Sweep', value: 'pichirp' },
			{ name: 'FM + RDS (Pifmrds)', value: 'pifmrds' },
			{ name: 'NBFM Audio', value: 'nbfm' },
			{ name: 'POCSAG Pager', value: 'pocsag' },
			{ name: 'Send IQ File', value: 'sendiq' },
			{ name: 'SSTV Image', value: 'pisstv' },
			{ name: 'Tune (Carrier)', value: 'tune' },
		],
		description: 'Rpitx mode to transmit with',
	},
	{
		displayName: 'Mode Parameters',
		name: 'params',
		type: 'collection',
		placeholder: 'Add Parameter',
		default: {},
		displayOptions: { show: { operation: ['start'] } },
		description: 'Mode-specific fields; only those relevant to the chosen mode are used',
		options: [
			{ displayName: 'Audio File', name: 'audio_file', type: 'string', default: '', description: 'Pifmrds: path to audio (WAV/raw) to broadcast' },
			{ displayName: 'Bandwidth (Hz)', name: 'bandwidth_hz', type: 'number', default: 0, description: 'Pichirp: sweep bandwidth in Hz' },
			{ displayName: 'Baud', name: 'baud', type: 'options', default: 1200, options: [ { name: '512', value: 512 }, { name: '1200', value: 1200 }, { name: '2400', value: 2400 } ], description: 'Pocsag: baud rate' },
			{ displayName: 'Duration (S)', name: 'duration_s', type: 'number', default: 0, description: 'Pichirp: sweep duration in seconds' },
			{ displayName: 'Gain', name: 'gain', type: 'number', default: 0.1, description: 'Nbfm: modulation gain / deviation (~0.1 for narrowband voice)' },
			{ displayName: 'Image File', name: 'image_file', type: 'string', default: '', description: 'Pisstv: path to image to encode' },
			{ displayName: 'IQ File', name: 'iq_file', type: 'string', default: '', description: 'Sendiq: path to IQ sample file' },
			{ displayName: 'Message', name: 'message', type: 'string', default: '', description: 'Pocsag: alphanumeric message' },
			{ displayName: 'RDS PS', name: 'rds_ps', type: 'string', default: '', description: 'Pifmrds: RDS program service name (max 8 chars)' },
			{ displayName: 'RDS Radiotext', name: 'rds_rt', type: 'string', default: '', description: 'Pifmrds: RDS radiotext' },
			{ displayName: 'RIC (Capcode)', name: 'ric', type: 'number', default: 0, description: 'Pocsag: receiver capcode' },
			{ displayName: 'Sample Rate', name: 'sample_rate', type: 'number', default: 48000, description: 'Sendiq: IQ sample rate in Hz' },
		],
	},

	// ---- Shared: max duration ----------------------------------------------
	{
		displayName: 'Max Seconds',
		name: 'maxSeconds',
		type: 'number',
		default: 0,
		displayOptions: { show: { operation: TX_OPS } },
		description:
			'Optional transmission length cap in seconds (0 = server default). Clamped to the server MAX_TX_SECONDS.',
	},
];
