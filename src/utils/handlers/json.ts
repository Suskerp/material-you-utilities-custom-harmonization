import { THEME_NAME } from '../../models/constants/theme';
import { HassElement } from '../../models/interfaces';
import { IHandlerArguments } from '../../models/interfaces/Input';
import { getEntityIdAndValue, getTargets } from '../common';
import { debugToast } from '../logging';
import { harmonizeCustomColors } from './harmonizeCustom';

export async function setCustomColorsFromJson(args: IHandlerArguments) {
	const hass = (document.querySelector('home-assistant') as HassElement).hass;
	const targets = args.targets ?? (await getTargets());

	try {
		const themeName = hass?.themes?.theme ?? '';
		if (!themeName.includes(THEME_NAME)) {
			return;
		}

		const path = getEntityIdAndValue('json_file', args.id).value as string;
		if (!path) {
			return;
		}

		const res = path.includes('://')
			? await fetch(path, { mode: 'cors', cache: 'no-cache' })
			: await hass.fetchWithAuth(path, {
					mode: 'cors',
					cache: 'no-cache',
				});

		if (!res.ok)
			throw new Error(await res.text().catch(() => `HTTP ${res.status}`));

		const text = await res.text();

		const isDark = getDarkMode(hass);
		const customColors = extractVariablesFromJsonForMode(text, isDark);
		if (!Object.keys(customColors).length) {
			return;
		}

		await harmonizeCustomColors(customColors, args, targets);
	} catch (e) {
		console.error('Failed to apply custom colors from JSON:', e);
		debugToast(String(e));
	}
}

function getDarkMode(hass: HassElement['hass']): boolean {
	if (hass?.themes && typeof hass.themes.darkMode === 'boolean')
		return hass.themes.darkMode;
	return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function extractVariablesFromJsonForMode(
	src: string,
	isDark: boolean,
): Record<string, string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(src);
	} catch {
		return {};
	}
	const root: Record<string, unknown> =
		parsed && typeof parsed === 'object'
			? (parsed as Record<string, unknown>)
			: {};

	const section = pickSection(root, isDark);
	const map = resolveColorsMap(section);

	const out: Record<string, string> = {};
	for (const [rawKey, rawVal] of Object.entries(map)) {
		const key = normalizeVarName(String(rawKey));
		if (!key) continue;

		const val =
			typeof rawVal === 'string' ? rawVal.trim() : String(rawVal ?? '').trim();
		const normHex = normalizeHex(val);
		if (normHex) out[key] = normHex;
	}
	return out;
}

function pickSection(
	root: Record<string, unknown>,
	isDark: boolean,
): Record<string, unknown> {
	if (root && typeof root === 'object' && ('light' in root || 'dark' in root)) {
		const section = isDark ? root.dark : root.light;
		return section && typeof section === 'object'
			? (section as Record<string, unknown>)
			: {};
	}
	return root;
}

function resolveColorsMap(
	node: Record<string, unknown>,
): Record<string, unknown> {
	if (
		node &&
		typeof node === 'object' &&
		node.colors &&
		typeof node.colors === 'object'
	)
		return node.colors as Record<string, unknown>;
	return node && typeof node === 'object' ? node : {};
}

function normalizeVarName(k: string): string | null {
	k = k.trim();
	if (!/^[a-zA-Z0-9_-]+$/.test(k)) return null;
	const bare = k.startsWith('--') ? k.slice(2) : k;
	return bare ? `--${bare}` : null;
}

function normalizeHex(s: string): string | null {
	// #RGB
	let m = s.match(/^#([0-9a-fA-F]{3})$/);
	if (m) {
		const [r, g, b] = m[1].split('').map((ch) => ch + ch);
		return `#${(r + g + b).toUpperCase()}`;
	}
	// #RRGGBB
	m = s.match(/^#([0-9a-fA-F]{6})$/);
	if (m) return `#${m[1].toUpperCase()}`;
	return null;
}
