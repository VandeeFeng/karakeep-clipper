// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import browser from './browser-polyfill';
import { generalSettings } from './storage-utils';
import { createHoarderHighlight, deleteHoarderHighlight, getHoarderBookmarkHtmlContent, getHoarderBookmarkIdByUrl, testConnection } from './hoarder-api';
import { saveToHoarder } from './highlighter';

const highlight = {
	bookmarkId: 'bookmark-id',
	text: 'selected text',
	startOffset: 5,
	endOffset: 18,
};

beforeEach(() => {
	vi.restoreAllMocks();
	Object.assign(generalSettings, {
		hoarderEnabled: true,
		hoarderServerUrl: 'https://karakeep.example',
		hoarderApiKey: 'test-token',
	});
});

describe('Karakeep SDK proxy', () => {
	test('checks bookmark URLs using the configured server and authorization', async () => {
		const sendMessage = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
			ok: true, status: 200, data: { bookmarkId: 'bookmark-id' },
		});

		await expect(getHoarderBookmarkIdByUrl('https://example.com/article')).resolves.toBe('bookmark-id');
		expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
			action: 'hoarderRequest',
			method: 'GET',
			url: 'https://karakeep.example/api/v1/bookmarks/check-url?url=https%3A%2F%2Fexample.com%2Farticle',
			headers: expect.objectContaining({ authorization: 'Bearer test-token' }),
		}));
	});

	test('retrieves bookmark HTML for highlight offsets', async () => {
		vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
			ok: true, status: 200, data: { content: { type: 'link', htmlContent: '<p>selected text</p>' } },
		});

		await expect(getHoarderBookmarkHtmlContent('bookmark-id')).resolves.toBe('<p>selected text</p>');
	});

	test('saves a bookmark and its highlights through the SDK', async () => {
		const sendMessage = vi.spyOn(browser.runtime, 'sendMessage')
			.mockResolvedValueOnce({ ok: true, status: 201, data: { id: 'bookmark-id' } })
			.mockResolvedValueOnce({ ok: true, status: 200, data: { content: { type: 'link', htmlContent: '<p>Intro: selected <strong>text</strong> after.</p>' } } })
			.mockResolvedValueOnce({ ok: true, status: 201, data: { id: 'highlight-id' } });

		await saveToHoarder('Article', 'https://example.com/article', 'Notes', '<p>Different local content</p>', [], [
			{ content: '<p>selected <strong>text</strong></p>', notes: ['annotation'] },
		]);

		expect(sendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
			method: 'POST',
			body: { title: 'Article', url: 'https://example.com/article', type: 'link', archived: false, favourited: false, note: 'Notes' },
		}));
		expect(sendMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
			method: 'GET',
			url: 'https://karakeep.example/api/v1/bookmarks/bookmark-id?includeContent=true',
		}));
		expect(sendMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({
			method: 'POST',
			body: { bookmarkId: 'bookmark-id', text: 'selected text', note: 'annotation', startOffset: 7, endOffset: 20, prefix: 'Intro: ', suffix: ' after.', color: 'yellow' },
		}));
	});

	test.each([
		['missing text', '<p>Other text.</p>', 'selected'],
		['ambiguous text', '<p>selected</p><p>selected</p>', 'selected'],
	] as const)('does not post guessed offsets for %s', async (_name, readerHtml, content) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const sendMessage = vi.spyOn(browser.runtime, 'sendMessage')
			.mockResolvedValueOnce({ ok: true, status: 201, data: { id: 'bookmark-id' } })
			.mockResolvedValueOnce({ ok: true, status: 200, data: { content: { type: 'link', htmlContent: readerHtml } } });

		await expect(saveToHoarder('Article', 'https://example.com', '', '', [], [{ content }]))
			.rejects.toThrow('Bookmark saved, but 1 highlight(s) could not be saved');
		expect(sendMessage).toHaveBeenCalledTimes(2);
	});

	test('waits for reader content instead of using the source HTML offsets', async () => {
		const sendMessage = vi.spyOn(browser.runtime, 'sendMessage')
			.mockResolvedValueOnce({ ok: true, status: 201, data: { id: 'bookmark-id' } })
			.mockResolvedValueOnce({ ok: true, status: 200, data: { content: { type: 'link', htmlContent: null } } });

		await expect(saveToHoarder('Article', 'https://example.com', '', '<p>selected</p>', [], [{ content: 'selected' }]))
			.rejects.toThrow('reader content is not ready');
		expect(sendMessage).toHaveBeenCalledTimes(2);
	});

	test('does not recreate highlights that are already synced', async () => {
		const sendMessage = vi.spyOn(browser.runtime, 'sendMessage')
			.mockResolvedValueOnce({ ok: true, status: 201, data: { id: 'bookmark-id' } });

		await saveToHoarder('Article', 'https://example.com', '', '', [], [
			{ content: '<p>selected</p>', hoarderHighlightId: 'highlight-id' },
		]);

		expect(sendMessage).toHaveBeenCalledTimes(1);
	});

	test('treats an already deleted highlight as success', async () => {
		vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ ok: false, status: 404, error: 'Not found' });

		await expect(deleteHoarderHighlight('highlight-id')).resolves.toBeUndefined();
	});

	test('surfaces server errors when creating highlights', async () => {
		vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ ok: false, status: 401, error: 'Unauthorized' });

		await expect(createHoarderHighlight(highlight)).rejects.toThrow('Unauthorized');
	});

	test.each([
		['bookmark lookup', () => getHoarderBookmarkIdByUrl('https://example.com'), 'Failed to check Hoarder bookmark URL'],
		['bookmark content', () => getHoarderBookmarkHtmlContent('bookmark-id'), 'Failed to get Hoarder bookmark content'],
		['highlight creation', () => createHoarderHighlight(highlight), 'Failed to create Hoarder highlight'],
		['bookmark creation', () => saveToHoarder('Article', 'https://example.com', '', ''), 'Failed to save to Hoarder'],
	] as const)('rejects empty successful responses for %s', async (_name, request, error) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ ok: true, status: 200, data: null });

		await expect(request()).rejects.toThrow(error);
	});

	test('does not report a successful connection without a user', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ ok: true, status: 200, data: null });

		await expect(testConnection()).resolves.toEqual({ ok: false });
	});
});
