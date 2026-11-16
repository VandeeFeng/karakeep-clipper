// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as hoarderApi from './hoarder-api';
import { saveToHoarder, highlightElement, updateHighlights, setPageUrl, type HighlightsStorage, type TextHighlightData } from './highlighter';
import browser from './browser-polyfill';
import { generalSettings } from './storage-utils';
import * as overlays from './highlighter-overlays';

let stored: HighlightsStorage;

beforeEach(() => {
	vi.restoreAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(hoarderApi, 'saveHoarderBookmark').mockResolvedValue('bookmark-id');
	vi.spyOn(hoarderApi, 'createHoarderHighlight').mockResolvedValue('highlight-id');
	stored = {};
	vi.spyOn(browser.storage.local, 'get').mockImplementation(async () => ({ highlights: structuredClone(stored) }));
	vi.spyOn(browser.storage.local, 'set').mockImplementation(async (value) => {
		stored = structuredClone(value.highlights as HighlightsStorage);
	});
});

async function saveHighlight(html: string, highlight: { content: string; textQuote?: { prefix: string; suffix: string } }) {
	vi.spyOn(hoarderApi, 'getHoarderBookmarkHtmlContent').mockResolvedValue(html);
	await saveToHoarder('Article', 'https://example.com', '', [highlight]);
	return vi.mocked(hoarderApi.createHoarderHighlight).mock.calls[0][0];
}

describe('Karakeep highlight retries', () => {
	const url = 'https://example.com/article';
	const first: TextHighlightData = { id: 'first', type: 'text', xpath: '/p[1]', content: 'first', startOffset: 0, endOffset: 5 };
	const second: TextHighlightData = { ...first, id: 'second', content: 'second' };

	test('persists successful ids on partial failure and skips them on a fresh retry', async () => {
		stored[url] = { url, title: 'Stored title', highlights: [first, second] };
		vi.spyOn(hoarderApi, 'getHoarderBookmarkHtmlContent').mockResolvedValue('<p>first second</p>');
		vi.mocked(hoarderApi.createHoarderHighlight)
			.mockResolvedValueOnce('first-remote')
			.mockRejectedValueOnce(new Error('temporary failure'))
			.mockResolvedValueOnce('second-remote');

		await expect(saveToHoarder('Article', url, '', structuredClone([first, second])))
			.rejects.toThrow('1 highlight(s)');
		expect(stored[url].highlights[0].hoarderHighlightId).toBe('first-remote');
		expect(stored[url].highlights[1].hoarderHighlightId).toBeUndefined();
		await saveToHoarder('Article', url, '', structuredClone([first, second]));

		expect(hoarderApi.createHoarderHighlight).toHaveBeenCalledTimes(3);
		expect(stored[url]).toMatchObject({ title: 'Stored title', highlights: [
			{ id: 'first', hoarderHighlightId: 'first-remote' },
			{ id: 'second', hoarderHighlightId: 'second-remote' },
		] });
	});

	test('incremental additions persist remote ids through the shared batch', async () => {
		const wasEnabled = generalSettings.hoarderEnabled;
		generalSettings.hoarderEnabled = true;
		setPageUrl(url);
		updateHighlights([]);
		vi.spyOn(overlays, 'planHighlightOverlayRects').mockImplementation(() => {});
		vi.spyOn(overlays, 'syncHoverListener').mockImplementation(() => {});
		vi.spyOn(hoarderApi, 'getHoarderBookmarkIdByUrl').mockResolvedValue('bookmark-id');
		vi.spyOn(hoarderApi, 'getHoarderBookmarkHtmlContent').mockResolvedValue('<pre>first</pre>');
		const element = document.createElement('pre');
		element.textContent = 'first';
		document.body.appendChild(element);

		try {
			highlightElement(element, ['annotation']);
			await vi.waitFor(() => expect(stored[url]?.highlights[0].hoarderHighlightId).toBe('highlight-id'));
			expect(hoarderApi.createHoarderHighlight).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
				bookmarkId: 'bookmark-id', text: 'first', note: 'annotation', startOffset: 0, endOffset: 5,
			}));
			expect(hoarderApi.saveHoarderBookmark).not.toHaveBeenCalled();
		} finally {
			element.remove();
			generalSettings.hoarderEnabled = wasEnabled;
			setPageUrl(window.location.href);
			updateHighlights([]);
		}
	});

	test.each(['edit', 'delete'])('preserves concurrent local %s when writing remote ids', async (change) => {
		stored[url] = { url, highlights: [first, second] };
		vi.spyOn(hoarderApi, 'getHoarderBookmarkHtmlContent').mockResolvedValue('<p>first second</p>');
		vi.mocked(hoarderApi.createHoarderHighlight).mockImplementation(async () => {
			stored[url].highlights = [{ ...(change === 'edit' ? first : second), notes: ['edited locally'] }];
			return 'remote-id';
		});

		await saveToHoarder('Article', url, '', structuredClone([first]));

		expect(stored[url].highlights).toEqual([change === 'edit'
			? { ...first, notes: ['edited locally'], hoarderHighlightId: 'remote-id' }
			: { ...second, notes: ['edited locally'] }]);
	});
});

describe('Karakeep highlight anchoring', () => {
	test('converts selected HTML and entities to reader text', async () => {
		const anchor = await saveHighlight('<p>Introduction.</p><p>A <strong>bold</strong> &amp; linked passage.</p>', {
			content: '<p><strong>bold</strong> &amp; linked</p>',
		});

		expect(anchor).toMatchObject({
			text: 'bold & linked', startOffset: 15, endOffset: 28,
			prefix: 'Introduction.A ', suffix: ' passage.',
		});
	});

	test('uses fragment text nodes including leading whitespace and style text', async () => {
		const anchor = await saveHighlight('  <style>p{color:red}</style><p>selected</p>', { content: '<p>selected</p>' });

		expect(anchor.startOffset).toBe('  p{color:red}'.length);
	});

	test('maps collapsed whitespace back to raw reader offsets', async () => {
		const anchor = await saveHighlight('<p>Before: selected\n \t<strong>text</strong> after.</p>', { content: '<p>selected text</p>' });

		expect(anchor).toMatchObject({ text: 'selected\n \ttext', startOffset: 8, endOffset: 23 });
	});

	test('uses quote context rather than relative page position for repeated text', async () => {
		const anchor = await saveHighlight('<p>Wrong quote nearby.</p><p>Right quote here.</p>', {
			content: '<p>quote</p>', textQuote: { prefix: 'Right ', suffix: ' here.' },
		});

		expect(anchor).toMatchObject({ text: 'quote', startOffset: 25, endOffset: 30 });
	});

	test.each([
		['missing content', '<p>Other text.</p>', '<p>selected</p>'],
		['empty reader', '', '<p>selected</p>'],
		['non-text selection', '<p>Other text.</p>', '<img src="image.png">'],
		['ambiguous quote', '<p>selected</p><p>selected</p>', '<p>selected</p>'],
	] as const)('rejects %s instead of inventing offsets', async (_name, html, content) => {
		await expect(saveHighlight(html, { content })).rejects.toThrow();
		expect(hoarderApi.createHoarderHighlight).not.toHaveBeenCalled();
	});

	test('rejects tied context matches', async () => {
		await expect(saveHighlight('<p>same quote here</p><p>same quote here</p>', {
			content: 'quote', textQuote: { prefix: 'same ', suffix: ' here' },
		})).rejects.toThrow();
		expect(hoarderApi.createHoarderHighlight).not.toHaveBeenCalled();
	});

	test('normalizes whitespace in quote context', async () => {
		const anchor = await saveHighlight('<p>Wrong quote here.</p><p>Right\n  quote\tthere.</p>', {
			content: ' quote ', textQuote: { prefix: 'Right', suffix: 'there.' },
		});

		expect(anchor.startOffset).toBe('Wrong quote here.Right\n  '.length);
	});

	const prefixes = ['', 'Intro: ', '前言😀', 'x'.repeat(100)];
	const whitespace = [' ', '\n\t ', '\u00a0'];
	const quotes = ['selected text', '选中 内容', '😀 selected'];
	for (const prefix of prefixes) {
		for (const space of whitespace) {
			for (const quote of quotes) {
				test(`offset invariant for ${JSON.stringify({ prefix, space, quote })}`, async () => {
					const rawQuote = quote.replace(' ', space);
					const readerText = prefix + rawQuote + ' suffix';
					const anchor = await saveHighlight(`<p>${prefix}<strong>${rawQuote}</strong> suffix</p>`, { content: `<p>${quote}</p>` });

					expect(readerText.slice(anchor.startOffset, anchor.endOffset)).toBe(rawQuote);
					expect(anchor.text).toBe(rawQuote);
					expect(anchor.startOffset).toBe(prefix.length);
					expect(anchor.prefix?.length).toBeLessThanOrEqual(32);
					expect(anchor.suffix?.length).toBeLessThanOrEqual(32);
				});
			}
		}
	}
});
