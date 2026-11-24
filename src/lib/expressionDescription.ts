/*
 * The expression "description" endpoints used to validate program rule
 * expressions expect a raw `text/plain` request body. The app-runtime data
 * engine only sends text/plain for a hardcoded list of resources that does
 * not include these endpoints, so we use fetch directly, mirroring how the
 * engine's RestAPILink builds URLs (relative URLs resolve against the
 * document base, absolute URLs are used as-is) and which headers its
 * fetchData sends.
 */

import { trimSlashes } from './path'

/** Outcome of asking the server to describe (validate) a single expression. */
export type DescribeResult =
    /** The server accepted the expression. */
    | { status: 'valid' }
    /** The server rejected the expression; `message` is its description. */
    | { status: 'invalid'; message: string }
    /**
     * The expression could not be validated at all: the request failed, or the
     * server answered with anything other than a verdict (5xx, 429, 400, a
     * proxy error page). Kept distinct from `invalid` so a server problem is
     * never reported to the user as a broken rule.
     */
    | { status: 'unavailable' }
    /** The session has ended (HTTP 401). Retrying cannot help. */
    | { status: 'unauthorized' }

/** Retries per expression for `unavailable` outcomes, on top of the first try. */
const RETRY_ATTEMPTS = 2
const RETRY_BASE_DELAY_MS = 300

/** Mirrors the engine's RestAPILink joinPath: strips separators between parts. */
const joinPath = (...parts: (string | undefined)[]): string =>
    parts
        .filter((part): part is string => !!part)
        .map(trimSlashes)
        .join('/')

/**
 * Build an API URL the same way the data engine does, so these POSTs target
 * the same API version as every other request the app makes.
 */
export const apiUrl = (
    baseUrl: string,
    path: string,
    apiVersion?: number
): string =>
    joinPath(
        baseUrl,
        'api',
        apiVersion === undefined ? undefined : String(apiVersion),
        path
    )

const abortError = (): Error =>
    Object.assign(new Error('Aborted'), { name: 'AbortError' })

const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError())
            return
        }
        // The abort handler and the timer refer to each other, so the timer
        // handle lives in an object that exists before both.
        const pending: { timer?: ReturnType<typeof setTimeout> } = {}
        const onAbort = () => {
            clearTimeout(pending.timer)
            reject(abortError())
        }
        pending.timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, ms)
        signal?.addEventListener('abort', onAbort, { once: true })
    })

const describeOnce = async ({
    url,
    expression,
    signal,
}: {
    url: string
    expression: string
    signal?: AbortSignal
}): Promise<DescribeResult> => {
    let response: Response
    try {
        response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                // The engine's fetchData sends these on every request. Without
                // X-Requested-With a 401 can make the browser open its native
                // basic-auth dialog, and some DHIS2 security configurations key
                // authorization behaviour off the header.
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json',
                'Content-Type': 'text/plain',
            },
            body: expression,
            signal,
        })
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            throw error
        }
        return { status: 'unavailable' }
    }

    if (response.status === 401) {
        return { status: 'unauthorized' }
    }
    // A verdict comes as HTTP 200 (conditions, and valid action expressions)
    // or HTTP 409 (invalid action expressions). Anything else is not a verdict
    // on the expression, even when its body says `status: ERROR`: DHIS2 puts
    // that in every error it returns itself (400, 403, 500 and so on).
    if (response.status !== 200 && response.status !== 409) {
        return { status: 'unavailable' }
    }

    let data: {
        status?: string
        description?: string
        message?: string
    } | null = null
    try {
        data = await response.json()
    } catch {
        // Not JSON, such as a login page served with HTTP 200 by an old
        // server or a proxy: no verdict.
    }

    if (data?.status === 'ERROR') {
        return {
            status: 'invalid',
            message: data.description || data.message || '',
        }
    }
    if (response.status === 200 && data?.status === 'OK') {
        return { status: 'valid' }
    }
    return { status: 'unavailable' }
}

/**
 * POST an expression to a description endpoint and report whether the server
 * considers it valid, invalid, or could not be reached.
 *
 * Transient failures are retried with a short backoff: a full run fires many
 * concurrent POSTs, so an occasional 5xx or rate-limit response is expected
 * and should not cost the user a whole expression's verdict.
 */
export const describeExpression = async ({
    baseUrl,
    apiVersion,
    path,
    expression,
    signal,
    retries = RETRY_ATTEMPTS,
}: {
    baseUrl: string
    apiVersion?: number
    path: string
    expression: string
    signal?: AbortSignal
    retries?: number
}): Promise<DescribeResult> => {
    const url = apiUrl(baseUrl, path, apiVersion)

    for (let attempt = 0; ; attempt++) {
        // oxlint-disable-next-line no-await-in-loop -- each retry depends on the previous attempt's result
        const result = await describeOnce({ url, expression, signal })
        if (result.status !== 'unavailable' || attempt >= retries) {
            return result
        }
        // Back off before retrying: an error under load is usually transient,
        // and retrying immediately would only add to the load that caused it.
        // oxlint-disable-next-line no-await-in-loop -- the backoff must finish before the next attempt
        await delay(RETRY_BASE_DELAY_MS * 2 ** attempt, signal)
    }
}
