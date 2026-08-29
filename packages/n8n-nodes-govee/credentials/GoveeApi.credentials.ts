import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GoveeApi implements ICredentialType {
	name = 'goveeApi';

	displayName = 'Govee API';

	documentationUrl = 'https://developer.govee.com/reference/apply-you-govee-api-key';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Govee developer API key. Request one from the Govee Home app: Profile → About Us → Apply for API Key.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'Govee-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://openapi.api.govee.com',
			url: '/router/api/v1/user/devices',
			method: 'GET',
		},
	};
}
