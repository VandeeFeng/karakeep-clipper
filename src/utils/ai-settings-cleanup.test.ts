import { expect, it } from 'vitest';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { removeAiSettings, removeAiTemplateContext } from './ai-settings-cleanup';

it.each(['', '{{content}}', 'Notes with {{title}} and context'])('cleans legacy templates without changing content: %s', (content) => {
	const template = {
		id: 'article',
		context: 'obsolete context',
		noteContentFormat: content,
		properties: [{ name: 'context', value: 'keep this property' }],
	};
	const source = {
		migrationVersion: 2,
		interpreter_settings: { providers: [{ apiKey: 'obsolete-test-key' }] },
		general_settings: { hoarderApiKey: 'test-karakeep-key' },
		template_list: ['plain', 'compressed'],
		template_plain: template,
		template_compressed: [compressToUTF16(JSON.stringify(template))],
	};
	const original = structuredClone(source);
	const cleaned = removeAiSettings(source);
	const expected = { id: template.id, noteContentFormat: content, properties: template.properties };

	expect(cleaned).not.toHaveProperty('interpreter_settings');
	expect(cleaned.general_settings).toEqual(source.general_settings);
	expect(cleaned.template_list).toEqual(source.template_list);
	expect(cleaned.template_plain).toEqual(expected);
	expect(JSON.parse(decompressFromUTF16(cleaned.template_compressed.join('')))).toEqual(expected);
	expect(source).toEqual(original);
	expect(removeAiSettings(cleaned)).toEqual(cleaned);
	expect(removeAiTemplateContext(template)).toEqual(expected);
});

it('preserves unreadable and non-legacy templates', () => {
	const source = {
		template_list: ['broken', 'current'],
		template_broken: ['invalid compressed template'],
		template_current: [compressToUTF16(JSON.stringify({ noteContentFormat: '{{content}}' }))],
	};
	expect(removeAiSettings(source)).toEqual(source);
});
