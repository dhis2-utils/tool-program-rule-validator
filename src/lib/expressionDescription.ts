/*
 * The expression "description" endpoints used to validate program rule
 * expressions expect a raw `text/plain` request body. The app-runtime data
 * engine only sends text/plain for a hardcoded list of resources that does
 * not include these endpoints, so we use fetch directly, mirroring how the
 * engine's RestAPILink builds URLs (relative URLs resolve against the
 * document base, absolute URLs are used as-is).
 */

const joinPath = (...parts: string[]): string =>
    parts
        .map((part) => part.replace(/^\/+|\/+$/g, ''))
        .filter((part) => part.length > 0)
        .join('/')

export const apiUrl = (baseUrl: string, path: string): string => {
    const joined = joinPath(baseUrl, 'api', path)
    // Preserve absolute URLs (joinPath collapses '//' after the scheme)
    return baseUrl.match(/^https?:\/\//)
        ? joined.replace(/^(https?:)\/+/, '$1//')
        : joined
}

/**
 * POST an expression to a description endpoint and return an error
 * message if the expression is invalid, or null if it is valid.
 */
export const describeExpression = async ({
    baseUrl,
    path,
    expression,
    fallbackErrorMessage,
    signal,
}: {
    baseUrl: string
    path: string
    expression: string
    fallbackErrorMessage: string
    signal?: AbortSignal
}): Promise<string | null> => {
    let response: Response
    try {
        response = await fetch(apiUrl(baseUrl, path), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'text/plain' },
            body: expression,
            signal,
        })
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            throw error
        }
        return fallbackErrorMessage
    }

    let data: { status?: string; description?: string; message?: string } = {}
    try {
        data = await response.json()
    } catch {
        // Response is not JSON — fall through to the status checks below
    }

    if (!response.ok || data.status === 'ERROR') {
        return data.description || data.message || fallbackErrorMessage
    }
    return null
}
