#!/usr/bin/env node
/* Copy node icons (*.svg, *.png) and codex files (*.node.json) from ./nodes
 * into ./dist/nodes, preserving structure. tsc does not emit un-imported JSON.
 * Zero dependencies; run from a package directory. */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve('nodes');
const DEST = path.resolve('dist', 'nodes');

function walk(dir, cb) {
	if (!fs.existsSync(dir)) return;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, cb);
		else cb(full);
	}
}

let count = 0;
walk(SRC, (file) => {
	if (!/(\.(svg|png)|\.node\.json)$/i.test(file)) return;
	const rel = path.relative(SRC, file);
	const target = path.join(DEST, rel);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.copyFileSync(file, target);
	count++;
});

console.log(`copied ${count} asset(s) to ${path.relative(process.cwd(), DEST)}`);
