import { trimSlashes, trimTrailingSlashes } from './path'

describe('trimSlashes', () => {
    it('strips leading and trailing slashes', () => {
        expect(trimSlashes('/api/apps/')).toBe('api/apps')
    })

    it('strips repeated slashes at both ends', () => {
        expect(trimSlashes('///api///')).toBe('api')
    })

    it('leaves interior slashes alone', () => {
        expect(trimSlashes('a/b/c')).toBe('a/b/c')
    })

    it('returns an empty string for slashes only', () => {
        expect(trimSlashes('////')).toBe('')
    })

    it('handles an empty string', () => {
        expect(trimSlashes('')).toBe('')
    })

    it('runs in linear time on a long run of slashes', () => {
        // The regex this replaced backtracked super-linearly on inputs of
        // this shape, which is what Sonar flagged.
        const input = `${'/'.repeat(50_000)}a`
        const started = Date.now()
        expect(trimSlashes(input)).toBe('a')
        expect(Date.now() - started).toBeLessThan(1000)
    })
})

describe('trimTrailingSlashes', () => {
    it('strips trailing slashes only', () => {
        expect(trimTrailingSlashes('https://x.org/dev/')).toBe(
            'https://x.org/dev'
        )
    })

    it('keeps the leading slash of a root-relative path', () => {
        expect(trimTrailingSlashes('/dhis/')).toBe('/dhis')
    })

    it('strips repeated trailing slashes', () => {
        expect(trimTrailingSlashes('https://x.org///')).toBe('https://x.org')
    })

    it('handles a string with no trailing slash', () => {
        expect(trimTrailingSlashes('https://x.org')).toBe('https://x.org')
    })

    it('runs in linear time on a long run of slashes', () => {
        const input = `a${'/'.repeat(50_000)}`
        const started = Date.now()
        expect(trimTrailingSlashes(input)).toBe('a')
        expect(Date.now() - started).toBeLessThan(1000)
    })
})
