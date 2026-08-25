import { apiUrl, describeExpression } from './expressionDescription'

const jsonResponse = (
    body: unknown,
    { status = 200 }: { status?: number } = {}
): Response =>
    ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    }) as Response

const nonJsonResponse = ({ status }: { status: number }): Response =>
    ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
            throw new SyntaxError('Unexpected token < in JSON')
        },
    }) as unknown as Response

const mockFetch = (fetchImpl: jest.Mock) => {
    globalThis.fetch = fetchImpl as unknown as typeof fetch
    return fetchImpl
}

const describe_ = (overrides: Record<string, unknown> = {}) =>
    describeExpression({
        baseUrl: 'https://play.dhis2.org/dev',
        apiVersion: 42,
        path: 'programRules/condition/description?programId=abc',
        expression: 'true',
        // Retries are exercised explicitly; default them off so the common
        // cases don't wait on backoff timers.
        retries: 0,
        ...overrides,
    })

describe('apiUrl', () => {
    it('builds a versioned URL from an absolute base', () => {
        expect(apiUrl('https://play.dhis2.org/dev', 'programRules', 42)).toBe(
            'https://play.dhis2.org/dev/api/42/programRules'
        )
    })

    it('omits the version segment when no apiVersion is given', () => {
        expect(apiUrl('https://play.dhis2.org/dev', 'programRules')).toBe(
            'https://play.dhis2.org/dev/api/programRules'
        )
    })

    it('keeps a relative base relative', () => {
        expect(apiUrl('..', 'programRules', 42)).toBe('../api/42/programRules')
    })

    it('collapses duplicated separators between parts', () => {
        expect(apiUrl('https://play.dhis2.org/dev/', '/programRules', 42)).toBe(
            'https://play.dhis2.org/dev/api/42/programRules'
        )
    })

    it('preserves the query string on the path', () => {
        expect(apiUrl('https://x.org', 'a/description?programId=abc', 41)).toBe(
            'https://x.org/api/41/a/description?programId=abc'
        )
    })
})

describe('describeExpression', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = originalFetch
        jest.clearAllMocks()
    })

    it('sends the headers the data engine sends, with a text/plain body', async () => {
        const fetchMock = mockFetch(
            jest.fn().mockResolvedValue(jsonResponse({ status: 'OK' }))
        )

        await describe_({ expression: '#{age} > 5' })

        const [url, options] = fetchMock.mock.calls[0]
        expect(url).toBe(
            'https://play.dhis2.org/dev/api/42/programRules/condition/description?programId=abc'
        )
        expect(options.method).toBe('POST')
        expect(options.body).toBe('#{age} > 5')
        expect(options.credentials).toBe('include')
        expect(options.headers).toMatchObject({
            'X-Requested-With': 'XMLHttpRequest',
            Accept: 'application/json',
            'Content-Type': 'text/plain',
        })
    })

    it('reports a valid expression', async () => {
        mockFetch(
            jest
                .fn()
                .mockResolvedValue(
                    jsonResponse({ status: 'OK', description: 'true' })
                )
        )

        await expect(describe_()).resolves.toEqual({ status: 'valid' })
    })

    it('reports a condition rejected with HTTP 200 and status ERROR as invalid', async () => {
        // How DHIS2 answers an unknown-variable reference in a condition.
        mockFetch(
            jest.fn().mockResolvedValue(
                jsonResponse({
                    status: 'ERROR',
                    message: 'Expression is not valid',
                    description: '1 error(s), 0 warning(s)',
                })
            )
        )

        await expect(describe_()).resolves.toEqual({
            status: 'invalid',
            message: '1 error(s), 0 warning(s)',
        })
    })

    it('reports an action expression rejected with HTTP 409 as invalid', async () => {
        mockFetch(
            jest.fn().mockResolvedValue(
                jsonResponse(
                    {
                        status: 'ERROR',
                        message: 'Expression is not valid',
                        description: 'Expected more arguments',
                    },
                    { status: 409 }
                )
            )
        )

        await expect(describe_()).resolves.toEqual({
            status: 'invalid',
            message: 'Expected more arguments',
        })
    })

    it('falls back to the message when the error carries no description', async () => {
        mockFetch(
            jest
                .fn()
                .mockResolvedValue(
                    jsonResponse(
                        { status: 'ERROR', message: 'Expression is not valid' },
                        { status: 409 }
                    )
                )
        )

        await expect(describe_()).resolves.toEqual({
            status: 'invalid',
            message: 'Expression is not valid',
        })
    })

    it('reports a 500 as unavailable rather than invalid', async () => {
        mockFetch(jest.fn().mockResolvedValue(nonJsonResponse({ status: 500 })))

        await expect(describe_()).resolves.toEqual({ status: 'unavailable' })
    })

    it('reports a rate-limit response as unavailable', async () => {
        mockFetch(jest.fn().mockResolvedValue(nonJsonResponse({ status: 429 })))

        await expect(describe_()).resolves.toEqual({ status: 'unavailable' })
    })

    it('reports an expired session (401) as unavailable', async () => {
        mockFetch(
            jest
                .fn()
                .mockResolvedValue(
                    jsonResponse(
                        { httpStatus: 'Unauthorized', message: 'Unauthorized' },
                        { status: 401 }
                    )
                )
        )

        await expect(describe_()).resolves.toEqual({ status: 'unavailable' })
    })

    it('reports a network failure as unavailable', async () => {
        mockFetch(jest.fn().mockRejectedValue(new TypeError('Failed to fetch')))

        await expect(describe_()).resolves.toEqual({ status: 'unavailable' })
    })

    it('retries an unavailable outcome and returns the eventual verdict', async () => {
        const fetchMock = mockFetch(
            jest
                .fn()
                .mockResolvedValueOnce(nonJsonResponse({ status: 503 }))
                .mockResolvedValueOnce(jsonResponse({ status: 'OK' }))
        )

        await expect(describe_({ retries: 2 })).resolves.toEqual({
            status: 'valid',
        })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('gives up as unavailable once the retries are exhausted', async () => {
        const fetchMock = mockFetch(
            jest.fn().mockResolvedValue(nonJsonResponse({ status: 503 }))
        )

        await expect(describe_({ retries: 2 })).resolves.toEqual({
            status: 'unavailable',
        })
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('does not retry a genuine validation error', async () => {
        const fetchMock = mockFetch(
            jest
                .fn()
                .mockResolvedValue(
                    jsonResponse(
                        { status: 'ERROR', description: 'nope' },
                        { status: 409 }
                    )
                )
        )

        await expect(describe_({ retries: 2 })).resolves.toEqual({
            status: 'invalid',
            message: 'nope',
        })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('propagates an abort instead of reporting it as unavailable', async () => {
        mockFetch(
            jest
                .fn()
                .mockRejectedValue(
                    Object.assign(new Error('Aborted'), { name: 'AbortError' })
                )
        )

        await expect(describe_()).rejects.toMatchObject({
            name: 'AbortError',
        })
    })

    it('aborts while backing off between retries', async () => {
        const controller = new AbortController()
        const fetchMock = mockFetch(
            jest.fn().mockImplementation(async () => {
                controller.abort()
                return nonJsonResponse({ status: 503 })
            })
        )

        await expect(
            describe_({ retries: 2, signal: controller.signal })
        ).rejects.toMatchObject({ name: 'AbortError' })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
