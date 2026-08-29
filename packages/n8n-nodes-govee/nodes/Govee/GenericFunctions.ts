import { NodeOperationError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow';
import type { Rgb } from './transports/types';

/** Parse "#rrggbb", "rrggbb", or "r,g,b" into an {r,g,b} object (0-255). */
export function parseColor(node: INode, input: string): Rgb {
	const value = (input ?? '').trim();

	if (value.includes(',')) {
		const parts = value.split(',').map((p) => Number(p.trim()));
		if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
			return clampRgb({ r: parts[0], g: parts[1], b: parts[2] });
		}
	}

	const hex = value.replace(/^#/, '');
	if (/^[0-9a-fA-F]{6}$/.test(hex)) {
		return {
			r: parseInt(hex.slice(0, 2), 16),
			g: parseInt(hex.slice(2, 4), 16),
			b: parseInt(hex.slice(4, 6), 16),
		};
	}

	throw new NodeOperationError(
		node,
		`Invalid color "${input}". Use "#rrggbb" or "r,g,b" (0-255).`,
	);
}

function clampRgb(rgb: Rgb): Rgb {
	const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
	return { r: clamp(rgb.r), g: clamp(rgb.g), b: clamp(rgb.b) };
}

/** Pack {r,g,b} into a single integer as the Govee Cloud API expects. */
export function rgbToInt(rgb: Rgb): number {
	return ((rgb.r & 0xff) << 16) | ((rgb.g & 0xff) << 8) | (rgb.b & 0xff);
}
