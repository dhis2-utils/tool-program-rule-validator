/*
 * Slash trimming without regular expressions.
 *
 * The obvious patterns for this (`/^\/+|\/+$/`, `/\/+$/`) backtrack
 * super-linearly on long runs of slashes, so these scan the string once
 * from each end instead.
 */

const SLASH = '/'

/** Remove leading and trailing slashes. */
export const trimSlashes = (value: string): string => {
    let start = 0
    let end = value.length
    while (start < end && value[start] === SLASH) {
        start++
    }
    while (end > start && value[end - 1] === SLASH) {
        end--
    }
    return value.slice(start, end)
}

/** Remove trailing slashes, leaving any leading slash in place. */
export const trimTrailingSlashes = (value: string): string => {
    let end = value.length
    while (end > 0 && value[end - 1] === SLASH) {
        end--
    }
    return value.slice(0, end)
}
