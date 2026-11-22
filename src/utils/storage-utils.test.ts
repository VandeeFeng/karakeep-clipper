import { beforeEach, expect, it, vi } from 'vitest';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { loadSettings } from './storage-utils';

const stored = vi.hoisted(() => ({
	sync: {} as Record<string, any>,
	local: {} as Record<string, any>,
}));

vi.mock('./browser-polyfill', () => ({
	default: {
		storage: {
			sync: {
				get: vi.fn(async () => structuredClone(stored.sync)),
				set: vi.fn(async (values) => { Object.assign(stored.sync, values); }),
				remove: vi.fn(async (key) => { delete stored.sync[key]; }),
			},
			local: {
				remove: vi.fn(async (key) => { delete stored.local[key]; }),
			},
		},
	},
}));

beforeEach(() => {
	stored.sync = {
		migrationVersion: 1,
		general_settings: {
			hoarderEnabled: true,
			hoarderServerUrl: 'https://bookmarks.example',
			hoarderApiKey: 'test-karakeep-key',
		},
		interpreter_settings: { providers: [{ apiKey: 'obsolete-test-key' }] },
		template_list: ['article'],
		template_article: [compressToUTF16(JSON.stringify({
			id: 'article', context: 'obsolete context', noteContentFormat: '{{content}}', properties: [],
		}))],
	};
	stored.local = { provider_presets: { version: 'old' }, lastSelectedVault: 'Notes' };
});

it('removes legacy AI data without changing clipping settings or template content', async () => {
	const settings = await loadSettings();
	expect(stored.sync).not.toHaveProperty('interpreter_settings');
	expect(stored.local).not.toHaveProperty('provider_presets');
	expect(stored.local.lastSelectedVault).toBe('Notes');
	expect(settings.hoarderApiKey).toBe('test-karakeep-key');
	expect(settings.hoarderEnabled).toBe(true);
	expect(JSON.parse(decompressFromUTF16(stored.sync.template_article.join('')))).toEqual({
		id: 'article', noteContentFormat: '{{content}}', properties: [],
	});
	const migrated = structuredClone(stored);
	await loadSettings();
	expect(stored).toEqual(migrated);
});
