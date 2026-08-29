module.exports = {
	root: true,
	env: {
		browser: true,
		es6: true,
		node: true,
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: ['./tsconfig.json'],
		sourceType: 'module',
		extraFileExtensions: ['.json'],
	},
	ignorePatterns: ['.eslintrc.js', '**/*.js', '**/node_modules/**', '**/dist/**'],
	overrides: [
		{
			files: ['package.json'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/community'],
			rules: {
				'n8n-nodes-base/community-package-json-name-still-default': 'off',
			},
		},
		{
			files: ['./credentials/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/credentials'],
			rules: {
				// GoveeApp holds an account login (email/password), not an API key,
				// so the "-Api" suffix conventions do not apply.
				'n8n-nodes-base/cred-class-name-unsuffixed': 'off',
				'n8n-nodes-base/cred-class-field-name-unsuffixed': 'off',
				'n8n-nodes-base/cred-class-field-display-name-missing-api': 'off',
				// Conflicts with cred-class-field-documentation-url-not-http-url:
				// its autofix camelCases the real https URL, breaking it.
				'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
			},
		},
		{
			files: ['./nodes/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/nodes'],
			rules: {
				'n8n-nodes-base/node-class-description-credentials-name-unsuffixed': 'off',
				// Keep the "Type" selector first in the action collection; alphabetizing
				// would push it to the bottom and hurt the form's usability.
				'n8n-nodes-base/node-param-fixed-collection-type-unsorted-items': 'off',
			},
		},
	],
};
