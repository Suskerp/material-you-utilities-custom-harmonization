import {
	argbFromHex,
	Blend,
	hexFromArgb,
} from '@material/material-color-utilities';
import { unset } from '.';
import { THEME_NAME, THEME_TOKEN } from '../../models/constants/theme';
import { HassElement } from '../../models/interfaces';
import { IHandlerArguments } from '../../models/interfaces/Input';
import { getTargets } from '../common';
import { mdLog } from '../logging';
import { unsetPalette } from './palettes';
import { applyStyleTag, buildStylesString } from './styles';

const STYLE_ID = `${THEME_TOKEN}-harmonized-colors-custom`;

/**
 * Harmonize a set of user-defined color variables
 * @param inputColors - CSS variable name to hex color mapping
 * @param args - handler arguments (for dissonance fallback)
 * @param targets - optional elements to apply styles to
 */
export async function harmonizeCustomColors(
	inputColors: Record<string, string>,
	args: IHandlerArguments,
	targets?: HTMLElement[],
) {
	const hass = (document.querySelector('home-assistant') as HassElement).hass;
	const themeName = hass?.themes?.theme ?? '';

	try {
		if (!themeName.includes(THEME_NAME)) {
			await dissonance(args);
			return;
		}

		if (!targets) {
			targets = await getTargets();
		}

		const baseColorHex =
			getComputedStyle(targets[0]).getPropertyValue('--primary-color') ||
			'#000000';
		const baseColorArgb = argbFromHex(baseColorHex.trim());

		const styles: Record<string, string> = {};
		for (const [cssVar, colorHex] of Object.entries(inputColors)) {
			const varName = cssVar.replace(/^--/, '');
			const harmonizedHex = hexFromArgb(
				Blend.harmonize(argbFromHex(colorHex), baseColorArgb),
			);
			styles[`--md-sys-cust-color-${varName}`] = harmonizedHex;
		}

		for (const target of targets) {
			applyStyleTag(target, STYLE_ID, buildStylesString(styles));
		}

		mdLog(targets[0], 'Custom colors harmonized.', true);
	} catch (e) {
		console.error('Error harmonizing custom colors:', e);
		await dissonance(args);
	}
}

async function dissonance(args: IHandlerArguments) {
	await unset(args, STYLE_ID, 'Custom Harmonized colors removed.');
	await unsetPalette(args);
}
