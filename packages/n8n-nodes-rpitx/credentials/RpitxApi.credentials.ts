import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class RpitxApi implements ICredentialType {
	name = 'rpitxApi';

	displayName = 'Rpitx Dashboard API';

	documentationUrl = 'https://github.com/f5oeo/rpitx';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://localhost:8000',
			required: true,
			placeholder: 'http://raspberrypi.local:8080',
			description: 'Root URL of the rpibase-tx dashboard service (no trailing slash)',
		},
	];

	// No auth on the rpibase-tx API itself; this only pins the base URL so the
	// credential test below can reach the health endpoint.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/healthz',
			method: 'GET',
		},
	};
}
