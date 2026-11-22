import { compressToUTF16, decompressFromUTF16 } from 'lz-string';

const TEMPLATE_KEY_PREFIX = 'template_';
const TEMPLATE_LIST_KEY = 'template_list';
const STORAGE_CHUNK_SIZE = 8000;

export function removeAiTemplateContext<T>(template: T): T {
	if (!template || typeof template !== 'object' || !Object.prototype.hasOwnProperty.call(template, 'context')) {
		return template;
	}
	const cleaned = { ...template };
	delete (cleaned as Record<string, unknown>).context;
	return cleaned;
}

export function removeAiSettings<T extends Record<string, any>>(data: T): T {
	const cleaned = { ...data };
	delete cleaned.interpreter_settings;

	for (const [key, value] of Object.entries(data)) {
		if (!key.startsWith(TEMPLATE_KEY_PREFIX) || key === TEMPLATE_LIST_KEY) continue;

		if (!Array.isArray(value)) {
			(cleaned as Record<string, any>)[key] = removeAiTemplateContext(value);
			continue;
		}

		try {
			const template = JSON.parse(decompressFromUTF16(value.join('')));
			const cleanedTemplate = removeAiTemplateContext(template);
			if (cleanedTemplate === template) continue;

			const compressed = compressToUTF16(JSON.stringify(cleanedTemplate));
			const chunks: string[] = [];
			for (let index = 0; index < compressed.length; index += STORAGE_CHUNK_SIZE) {
				chunks.push(compressed.slice(index, index + STORAGE_CHUNK_SIZE));
			}
			(cleaned as Record<string, any>)[key] = chunks;
		} catch {
			// Preserve unreadable templates rather than losing user data during migration.
		}
	}

	return cleaned;
}
