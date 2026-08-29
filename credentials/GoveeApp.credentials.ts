import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class GoveeApp implements ICredentialType {
	name = 'goveeApp';

	displayName = 'Govee App Account';

	documentationUrl = 'https://github.com/wez/govee2mqtt';

	properties: INodeProperties[] = [
		{
			displayName:
				'This uses the undocumented Govee mobile-app AWS IoT channel (login → mTLS cert → MQTT). ' +
				'It may break if Govee changes their app API. Use the Cloud API connection where possible.',
			name: 'notice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			placeholder: 'name@example.com',
			default: '',
			required: true,
			description: 'Email of your Govee Home account',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Password of your Govee Home account',
		},
	];
}
