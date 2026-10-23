/*
 * Pure helpers for detecting program rule variable usage inside program
 * rule expressions (conditions, action data expressions and action content
 * templates).
 *
 * A variable reported as unused can be deleted from the app, and deleting a
 * variable that a rule still needs breaks that rule. So the detection errs
 * towards "used": a reference anywhere in the text counts, including inside
 * a string literal, because some functions take an expression as a string
 * (d2:countIfCondition) and action content is display text, not an
 * expression.
 */

/**
 * Collect the contents of quoted string literals. Functions such as
 * d2:hasValue, d2:count, d2:countIfValue, d2:countIfZeroPos, d2:maxValue,
 * d2:minValue, d2:lastEventDate and d2:countIfCondition take a variable by
 * its quoted name, so any literal that equals a variable name is a reference.
 */
export const extractQuotedNames = (text: string): string[] => {
    const names: string[] = []
    const regex = /(["'])(.*?)\1/g
    for (const match of text.matchAll(regex)) {
        names.push(match[2].trim())
    }
    return names
}

/**
 * Return the subset of `variableNames` that is referenced by any of the
 * given texts, as #{name}, A{name}, or a quoted 'name' argument.
 */
export const collectUsedVariableNames = (
    variableNames: string[],
    texts: string[]
): Set<string> => {
    const used = new Set<string>()
    const quotedNames = new Set(texts.flatMap(extractQuotedNames))
    for (const name of variableNames) {
        const curlyRef = `#{${name}}`
        const attributeRef = `A{${name}}`
        if (
            quotedNames.has(name) ||
            texts.some(
                (text) => text.includes(curlyRef) || text.includes(attributeRef)
            )
        ) {
            used.add(name)
        }
    }
    return used
}
