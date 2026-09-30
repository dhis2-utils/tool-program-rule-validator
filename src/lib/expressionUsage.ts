/*
 * Pure helpers for detecting program rule variable usage inside program
 * rule expressions (conditions, action data expressions and action content
 * templates).
 */

/**
 * Remove quoted string literals from an expression so that variable
 * references inside literals (e.g. '#{foo}' as text) don't count as usage.
 */
export const stripStringLiterals = (expression: string): string =>
    expression.replaceAll(/(["'])(?:\\.|[^\\])*?\1/g, '')

/**
 * Extract variable names referenced through d2:hasValue('name') calls.
 * These references live inside string literals, so they are collected
 * from the raw (unstripped) expression.
 */
export const extractPrvsFromD2HasValue = (expression: string): string[] => {
    const matches: string[] = []
    const regex = /d2:hasValue\s*\(\s*["']([^"']+)["']\s*\)/g
    let match
    while ((match = regex.exec(expression)) !== null) {
        matches.push(match[1])
    }
    return matches
}

/**
 * Return the subset of `variableNames` that is referenced by any of the
 * given texts, either as #{name} / A{name} (outside string literals) or
 * via d2:hasValue('name') in `hasValueSources`.
 */
export const collectUsedVariableNames = (
    variableNames: string[],
    texts: string[],
    hasValueSources: string[]
): Set<string> => {
    const used = new Set<string>()
    const hasValuePrvs = new Set(
        hasValueSources.flatMap(extractPrvsFromD2HasValue)
    )
    const cleanTexts = texts.map(stripStringLiterals)
    for (const name of variableNames) {
        const curlyRef = `#{${name}}`
        const attributeRef = `A{${name}}`
        if (
            cleanTexts.some(
                (text) => text.includes(curlyRef) || text.includes(attributeRef)
            ) ||
            hasValuePrvs.has(name)
        ) {
            used.add(name)
        }
    }
    return used
}
