/*
 * Pure helpers for detecting program rule variable usage inside program
 * rule expressions (conditions, action data expressions and action content).
 *
 * The rule follows the expression parser that DHIS2 uses for program rules
 * (github.com/dhis2/expression-parser, ExpressionGrammar.kt and Expr.kt).
 * A program rule variable can be referenced:
 *
 *   - as #{name} or A{name};
 *   - by quoted name, 'name' or "name", as the data item argument of
 *     d2:count, d2:countIfValue, d2:countIfZeroPos, d2:hasValue,
 *     d2:maxValue and d2:minValue;
 *   - by any expression that evaluates to its name, in d2:lastEventDate;
 *   - inside a string literal that is itself parsed as an expression, the
 *     condition argument of d2:condition.
 *
 * This tool deletes what it reports as unused, so it errs towards "used":
 * a #{name} or A{name} anywhere in the text counts, even inside a string
 * literal, and so does any string literal that equals a variable name,
 * whichever function it is passed to. A variable whose name only appears as
 * a text value is kept, which is the safe direction. A name that is built at
 * run time, such as d2:lastEventDate(d2:concatenate('a', 'b')), cannot be
 * detected; the user documentation lists this as a known limitation.
 */

const QUOTES = new Set(['"', "'"])

/**
 * Read a string literal starting at `start` (the opening quote), using the
 * parser's escape rules: a backslash escapes the next character, and \uXXXX
 * is a Unicode code point. Returns the literal's value and the index after
 * its closing quote, or null for an unterminated literal.
 */
const readStringLiteral = (
    text: string,
    start: number
): { value: string; end: number } | null => {
    const quote = text[start]
    let value = ''
    let i = start + 1
    while (i < text.length) {
        const c = text[i]
        if (c === quote) {
            return { value, end: i + 1 }
        }
        if (c === '\\' && i + 1 < text.length) {
            const next = text[i + 1]
            const hex = text.slice(i + 2, i + 6)
            if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(hex)) {
                value += String.fromCodePoint(Number.parseInt(hex, 16))
                i += 6
            } else {
                value += next
                i += 2
            }
            continue
        }
        value += c
        i++
    }
    return null
}

/** Return the values of all quoted string literals in an expression. */
export const extractStringLiterals = (expression: string): string[] => {
    const literals: string[] = []
    let i = 0
    while (i < expression.length) {
        if (QUOTES.has(expression[i])) {
            const literal = readStringLiteral(expression, i)
            if (!literal) {
                break
            }
            literals.push(literal.value)
            i = literal.end
        } else {
            i++
        }
    }
    return literals
}

/**
 * Return the subset of `variableNames` that any of the given texts
 * references, in any of the forms listed at the top of this file.
 */
export const collectUsedVariableNames = (
    variableNames: string[],
    texts: string[]
): Set<string> => {
    const used = new Set<string>()
    const literals = new Set(texts.flatMap(extractStringLiterals))
    for (const name of variableNames) {
        const curlyRef = `#{${name}}`
        const attributeRef = `A{${name}}`
        if (
            literals.has(name) ||
            texts.some(
                (text) => text.includes(curlyRef) || text.includes(attributeRef)
            )
        ) {
            used.add(name)
        }
    }
    return used
}
