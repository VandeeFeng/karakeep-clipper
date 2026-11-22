// Template compiler for the Web Clipper template engine
// This module provides the main entry point for template compilation,
// integrating the AST-based renderer with the variable processors.

import { createEngine } from 'knap';
import { clipperFilters, type ClipperTemplateContext } from './filters';
import { processSimpleVariable } from './variables/simple';
import { processSelector, resolveSelector } from './variables/selector';
import { processSchema } from './variables/schema';
import { resolveSchemaVariable } from './resolver';

export interface RenderContext {
	variables: Record<string, any>;
	currentUrl: string;
	tabId?: number;
}

export type AsyncResolver = (name: string, context: RenderContext) => Promise<any>;

const engine = createEngine<ClipperTemplateContext>({ filters: clipperFilters });

/**
 * A function that processes a selector match string and returns the result.
 * Used to inject different selector implementations (browser vs CLI).
 */
export type SelectorProcessor = (match: string, currentUrl: string) => Promise<string>;

/**
 * Main function to compile a template with the given variables.
 *
 * @param tabId - Browser tab ID for selector resolution (0 if not applicable)
 * @param text - Template string to compile
 * @param variables - Variables available in the template
 * @param currentUrl - Current page URL for filter processing
 * @param customAsyncResolver - Optional async resolver override (defaults to browser selector resolver)
 * @param customSelectorProcessor - Optional selector processor override for post-processing
 * @returns Compiled template string
 */
export async function compileTemplate(
	tabId: number,
	text: string,
	variables: { [key: string]: any },
	currentUrl: string,
	customAsyncResolver?: AsyncResolver,
	customSelectorProcessor?: SelectorProcessor
): Promise<string> {
	// Strip text fragment from URL
	currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

	// Keep application-specific variable resolution outside the shared engine.
	const resolveVariable = async (name: string): Promise<any> => {
		if (customAsyncResolver) {
			const value = await customAsyncResolver(name, {
				variables,
				currentUrl,
				tabId,
			});
			if (value !== undefined) {
				return value;
			}
		}

		if (name.startsWith('selector:') || name.startsWith('selectorHtml:')) {
			return resolveSelector(tabId, name);
		}
		if (name.startsWith('schema:')) {
			return resolveSchemaVariable(name, variables);
		}

		return undefined;
	};

	const result = await engine.render(text, {
		variables,
		context: { tabId, currentUrl },
		resolveVariable,
	});

	// Log any errors (but don't fail - return partial output)
	if (result.errors.length > 0) {
		console.error('Template compilation errors:', result.errors.map(e => `Line ${e.line}: ${e.message}`).join('; '));
	}
	if (result.warnings.length > 0) {
		console.warn(
			'Template compilation warnings:',
			result.warnings.map(warning =>
				`Line ${warning.line}, filter ${warning.filter}: ${warning.message}`
			).join('; '),
		);
	}

	return result.output;
}

/**
 * Process variables and apply filters.
 * Handles special variable types: selector, schema.
 *
 * This is called after the AST-based renderer to handle any remaining
 * variable interpolations that need special processing.
 */
export async function processVariables(
	tabId: number,
	text: string,
	variables: { [key: string]: any },
	currentUrl: string,
	customSelectorProcessor?: SelectorProcessor
): Promise<string> {
	const regex = /{{([\s\S]*?)}}/g;
	let result = text;
	let match;

	while ((match = regex.exec(result)) !== null) {
		const fullMatch = match[0];
		const trimmedMatch = match[1].trim();

		let replacement: string;

		if (trimmedMatch.startsWith('selector:') || trimmedMatch.startsWith('selectorHtml:')) {
			if (customSelectorProcessor) {
				replacement = await customSelectorProcessor(fullMatch, currentUrl);
			} else {
				replacement = await processSelector(tabId, fullMatch, currentUrl);
			}
		} else if (trimmedMatch.startsWith('schema:')) {
			replacement = await processSchema(fullMatch, variables, currentUrl);
		} else {
			replacement = await processSimpleVariable(trimmedMatch, variables, currentUrl);
		}

		result = result.substring(0, match.index) + replacement + result.substring(match.index + fullMatch.length);
		regex.lastIndex = match.index + replacement.length;
	}

	return result;
}
