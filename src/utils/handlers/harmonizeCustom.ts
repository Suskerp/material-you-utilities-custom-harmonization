import {
	argbFromHex,
	Blend,
	hexFromArgb,
} from '@material/material-color-utilities';
import { unset } from '.';
import { THEME_TOKEN } from '../../models/constants/theme';
import { IHandlerArguments } from '../../models/interfaces/Input';
import { getARGBColor, getTargets, isThemeValid } from '../common';
import { mdLog } from '../logging';
import { applyStyleTag, buildStylesString } from './styles';

const STYLE_ID = `${THEME_TOKEN}-harmonized-colors-custom`;

/**
 * Harmonize a set of user-defined color variables
 * @param inputColors - CSS variable name to hex color mapping
 * @param args - handler arguments (used to unset on failure)
 * @param targets - optional elements to apply styles to
 */
export async function harmonizeCustomColors(
	inputColors: Record<string, string>,
	args: IHandlerArguments,
	targets?: HTMLElement[],
) {
	try {
		if (!isThemeValid()) {
			await unsetCustomColors(args);
			return;
		}

		if (!targets) {
			targets = await getTargets();
		}

		const baseColorArgb = getARGBColor(
			'--primary-color',
			getComputedStyle(targets[0]),
		);

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
		await unsetCustomColors(args);
	}
}

/**
 * Remove the custom harmonized colors style tag. Only touches this fork's own
 * style tag, upstream palettes and semantic harmonization are left alone.
 */
export async function unsetCustomColors(args: IHandlerArguments) {
	await unset(args, STYLE_ID, 'Custom harmonized colors removed.');
}
