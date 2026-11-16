// @vitest-environment jsdom
import { afterEach, describe, test, expect, vi } from 'vitest';
import browser from './browser-polyfill';
import { extractPageContent, processHighlights } from './content-extractor';
import { TextHighlightData } from './highlighter';
import * as highlighter from './highlighter';
import * as shadowDom from './flatten-shadow-dom';
import Defuddle from 'defuddle';

// Default settings already use highlighterEnabled + 'highlight-inline', the
// behavior these tests exercise.

function textHighlight(content: string): TextHighlightData {
	// xpath is empty so processing goes straight to the content-based path,
	// matching the common case where the recorded xpath (live/reader DOM)
	// doesn't resolve against the extracted article content.
	return { type: 'text', id: '1', xpath: '', content, startOffset: 0, endOffset: 0 };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('extractPageContent highlight transport', () => {
	test('content messages include metadata alongside legacy strings', async () => {
		vi.useFakeTimers();
		vi.spyOn(highlighter, 'loadHighlights').mockResolvedValue();
		vi.spyOn(shadowDom, 'flattenShadowDom').mockResolvedValue();
		vi.spyOn(Defuddle.prototype, 'parseAsync').mockResolvedValue({
			content: '<p>article</p>', title: 'Article',
		} as Awaited<ReturnType<Defuddle['parseAsync']>>);
		const register = vi.spyOn(browser.runtime.onMessage, 'addListener');
		await import('../content');
		const listener = register.mock.calls[0][0];
		const highlight = { ...textHighlight('quote'), textQuote: { prefix: 'Right ', suffix: ' here.' }, hoarderHighlightId: 'remote-id' };
		highlighter.updateHighlights([highlight]);

		try {
			const response = await new Promise<unknown>(resolve => {
				listener({ action: 'getPageContent' }, {} as browser.Runtime.MessageSender, resolve);
			});
			expect(response).toMatchObject({ highlights: ['quote'], highlightData: [highlight] });
		} finally {
			highlighter.updateHighlights([]);
			delete window.__obsidianHighlighter;
		}
	});

	test('preserves metadata without changing legacy highlight conversion', async () => {
		const highlight = {
			...textHighlight('<p>quote</p>'),
			textQuote: { prefix: 'Right ', suffix: ' here.' },
			hoarderHighlightId: 'remote-id',
		};
		vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
			content: '<p>article</p>', highlights: [highlight.content], highlightData: [highlight],
		});

		const result = await extractPageContent(1);

		expect(result?.highlightData).toEqual([highlight]);
		expect(result?.highlights[0].content).toBe(`<div>${highlight.content}</div>`);
	});

	test('still accepts content scripts without structured metadata', async () => {
		vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
			content: '<p>article</p>', highlights: ['quote'],
		});

		const result = await extractPageContent(1);

		expect(result?.highlightData).toBeUndefined();
		expect(result?.highlights[0]).toMatchObject({ type: 'text', content: '<div>quote</div>' });
	});
});

describe('processHighlights — highlight-inline', () => {
	const article = '<p>A seismic shift is rocking the healthcare industry. Much like Uber once did.</p>';

	test('wraps a whole-paragraph highlight', () => {
		const result = processHighlights(article, [
			textHighlight('<p>A seismic shift is rocking the healthcare industry. Much like Uber once did.</p>'),
		]);
		expect(result).toContain('<mark>A seismic shift is rocking the healthcare industry. Much like Uber once did.</mark>');
	});

	// Regression for #446 / #852: a sentence highlighted within a paragraph was
	// dropped because it never equaled the full paragraph text.
	test('wraps a sentence highlighted within a paragraph', () => {
		const result = processHighlights(article, [
			textHighlight('<p>A seismic shift is rocking the healthcare industry.</p>'),
		]);
		expect(result).toContain('<mark>A seismic shift is rocking the healthcare industry.</mark>');
		expect(result).toContain('Much like Uber once did.');
	});

	// A partial highlight crossing an inline element must still wrap (the range
	// spans nodes, so it uses extractContents rather than surroundContents).
	test('wraps a partial highlight that spans an inline element', () => {
		const withLink = '<p>A <a href="#">seismic</a> shift is rocking the healthcare industry. Much like Uber.</p>';
		const result = processHighlights(withLink, [
			textHighlight('<p>A seismic shift is rocking the healthcare industry.</p>'),
		]);
		const mark = new DOMParser().parseFromString(result, 'text/html').querySelector('mark');
		expect(mark).not.toBeNull();
		expect(mark!.textContent?.replace(/\s+/g, ' ').trim()).toBe('A seismic shift is rocking the healthcare industry.');
		// The link must survive inside the mark, proving the range crossed it.
		expect(mark!.querySelector('a')).not.toBeNull();
	});
});
