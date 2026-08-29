const path = require('path');
const { src, dest } = require('gulp');

function buildIcons() {
	const nodeSource = path.resolve('nodes', '**', '*.{png,svg}');
	const nodeDestination = path.resolve('dist', 'nodes');
	return src(nodeSource).pipe(dest(nodeDestination));
}

exports['build:icons'] = buildIcons;
