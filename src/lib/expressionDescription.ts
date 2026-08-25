/*
 * The expression "description" endpoints used to validate program rule
 * expressions expect a raw `text/plain` request body. The app-runtime data
 * engine only sends text/plain for a hardcoded list of resources that does
 * not include these endpoints, so we use fetch directly, mirroring how the
 * engine's RestAPILink builds URLs (relative URLs resolve against the
 * document base, absolute URLs are used as-is) and which headers its
 * fetchData sends.
 */

/** Outcome of asking the server to describe (validate) a single expression. */
export type DescribeResult =
    /** The server accepted the expression. */
    | { status: 'valid' }
    /** The server rejected the expression; `message` is its description. */
    | { status: 'invalid'; message: string }
    /**
     * The expression could not be validated at all: the request failed, or the
     * server answered with an error carrying no validation verdict (5xx, 429,
     * a proxy error page, an expired session). Kept distinct from `invalid` so
     * a transient failure is never reported to the user as a broken rule.
     */
    | { status: 'unavailable' }

/** Retries per expression for `unavailable` outcomes, on top of the first try. */
const RETRY_ATTEMPTS = 2
const RETRY_BASE_DELAY_MS = 300

/** Mirrors the engine's RestAPILink joinPath: strips separators between parts. */
const joinPath = (...parts: (string | undefined)[]): string =>
    parts
        .filter((part): part is string => !!part)
        .map((part) => part.replace(/^\/+|\/+$/g, ''))
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
        const onAbort = () => {
            clearTimeout(timer)
            reject(abortError())
        }
        const timer = setTimeout(() => {
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

    let data: {
        status?: string
        description?: string
        message?: string
    } | null = null
    try {
        data = await response.json()
    } catch {
        // Not JSON (an error page, an empty body) — handled by the checks below
    }

    // DHIS2 reports a genuinely invalid expression with a `status: ERROR` body:
    // HTTP 200 for conditions, HTTP 409 for action data expressions. Any other
    // non-OK response is a transport or server failure, not a verdict on the
    // expression, and must not be rendered as an invalid-expression row.
    if (data?.status === 'ERROR') {
        return {
            status: 'invalid',
            message: data.description || data.message || '',
        }
    }
    if (!response.ok) {
        return { status: 'unavailable' }
    }
    return { status: 'valid' }
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
        const result = await describeOnce({ url, expression, signal })
        if (result.status !== 'unavailable' || attempt >= retries) {
            return result
        }
        // Back off before retrying: an error under load is usually transient,
        // and retrying immediately would only add to the load that caused it.
        await delay(RETRY_BASE_DELAY_MS * 2 ** attempt, signal)
    }
}
