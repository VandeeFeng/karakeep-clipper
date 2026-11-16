import { createKarakeepClient, type KarakeepAPISchemas } from '@karakeep/sdk';
import { generalSettings } from './storage-utils';
import browser from './browser-polyfill';

interface HoarderUser {
    id: string;
    email?: string | null;
    name?: string | null;
}

type HoarderBookmark = KarakeepAPISchemas['Bookmark'];
type HoarderHighlight = KarakeepAPISchemas['Highlight'];

interface HoarderProxyResponse {
    ok: boolean;
    status?: number;
    statusText?: string;
    error?: string;
    data?: unknown;
}

async function hoarderProxyFetch(request: Request): Promise<Response> {
    const bodyText = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
        headers[key] = value;
    });

    const response = await browser.runtime.sendMessage({
        action: 'hoarderRequest',
        method: request.method,
        url: request.url,
        headers,
        body: bodyText ? JSON.parse(bodyText) : undefined
    }) as HoarderProxyResponse;

    return new Response(JSON.stringify(response.ok ? response.data : { error: response.error || response.statusText }), {
        status: response.status ?? (response.ok ? 200 : 500),
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json' }
    });
}

function createHoarderClient() {
    return createKarakeepClient({
        baseUrl: `${generalSettings.hoarderServerUrl}/api/v1/`,
        headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${generalSettings.hoarderApiKey}`
        },
        fetch: hoarderProxyFetch
    });
}

function assertHoarderConfigured(): void {
    if (!generalSettings.hoarderEnabled || !generalSettings.hoarderServerUrl || !generalSettings.hoarderApiKey) {
        throw new Error('Hoarder server URL and API key must be configured');
    }
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }

    if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') {
        return error.error;
    }

    return fallback;
}

export async function testConnection(): Promise<{ ok: boolean; user?: HoarderUser }> {
    if (!generalSettings.hoarderServerUrl || !generalSettings.hoarderApiKey) {
        throw new Error('Hoarder server URL and API key must be configured');
    }

    try {
        const { data, error, response } = await createHoarderClient().GET('/users/me');

        if (error || !data) {
            console.error('Hoarder connection test failed:', error);
            return { ok: false };
        }

        return { ok: true, user: data };
    } catch (error) {
        console.error('Failed to test Hoarder connection:', error);
        return { ok: false };
    }
}

export async function getHoarderBookmarkIdByUrl(url: string): Promise<string | null> {
    assertHoarderConfigured();

    const { data, error } = await createHoarderClient().GET('/bookmarks/check-url', {
        params: { query: { url } }
    });

    if (error || !data) {
        throw new Error(getErrorMessage(error, 'Failed to check Hoarder bookmark URL'));
    }

    return data.bookmarkId;
}

export async function getHoarderBookmarkHtmlContent(bookmarkId: string): Promise<string | null> {
    assertHoarderConfigured();

    const { data, error } = await createHoarderClient().GET('/bookmarks/{bookmarkId}', {
        params: {
            path: { bookmarkId },
            query: { includeContent: true }
        }
    });

    if (error || !data) {
        throw new Error(getErrorMessage(error, 'Failed to get Hoarder bookmark content'));
    }

    return data.content.type === 'link' ? data.content.htmlContent ?? null : null;
}

export async function deleteHoarderHighlight(highlightId: string): Promise<void> {
    assertHoarderConfigured();

    const { error, response } = await createHoarderClient().DELETE('/highlights/{highlightId}', {
        params: { path: { highlightId } }
    });

    if (error && response.status !== 404) {
        throw new Error(getErrorMessage(error, 'Failed to delete Hoarder highlight'));
    }
}

export async function createHoarderHighlight(params: {
    bookmarkId: string;
    text: string;
    note?: string;
    startOffset: number;
    endOffset: number;
    prefix?: string;
    suffix?: string;
}): Promise<string | null> {
    assertHoarderConfigured();

    const { data, error } = await createHoarderClient().POST('/highlights', {
        body: {
            bookmarkId: params.bookmarkId,
            startOffset: params.startOffset,
            endOffset: params.endOffset,
            text: params.text,
            prefix: params.prefix ?? null,
            suffix: params.suffix ?? null,
            note: params.note ?? null,
            color: 'yellow'
        }
    });

    if (error || !data) {
        throw new Error(getErrorMessage(error, 'Failed to create Hoarder highlight'));
    }

    return data.id;
}

export async function saveHoarderBookmark(
    title: string,
    url: string,
    content: string
): Promise<string> {
    assertHoarderConfigured();

    const bookmark = {
        title,
        url,
        type: 'link' as const,
        archived: false,
        favourited: false,
        note: content,
    };

    const { data, error, response } = await createHoarderClient().POST('/bookmarks', { body: bookmark });

    if (error || !data) {
        const errorMessage = getErrorMessage(error, response.statusText || 'Unknown error');
        console.error('Failed to save bookmark:', response.status, response.statusText, errorMessage);
        throw new Error(`Failed to save to Hoarder: ${errorMessage}`);
    }

    const bookmarkId = data.id;
    if (!bookmarkId) {
        throw new Error('Failed to get bookmark ID from response');
    }

    return bookmarkId;
}
