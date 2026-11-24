import {
    collectUsedVariableNames,
    extractStringLiterals,
} from './expressionUsage'

describe('extractStringLiterals', () => {
    it('reads single- and double-quoted literals', () => {
        expect(extractStringLiterals(`d2:hasValue('a') && "b" == 'c'`)).toEqual(
            ['a', 'b', 'c']
        )
    })

    it('applies backslash escapes', () => {
        expect(
            extractStringLiterals(String.raw`'it\'s' + "say \"hi\""`)
        ).toEqual(["it's", 'say "hi"'])
    })

    it('decodes \\u escapes', () => {
        expect(extractStringLiterals("'\\u0061ge'")).toEqual(['age'])
    })

    it('keeps the other quote character inside a literal', () => {
        expect(extractStringLiterals(`"it's"`)).toEqual(["it's"])
    })

    it('stops at an unterminated literal', () => {
        expect(extractStringLiterals(`'a' + 'b`)).toEqual(['a'])
    })

    it('returns nothing for an expression without literals', () => {
        expect(extractStringLiterals('#{age} > 5')).toEqual([])
    })
})

describe('collectUsedVariableNames', () => {
    const used = (texts: string[], names = ['v']) =>
        collectUsedVariableNames(names, texts)

    it('detects #{name}', () => {
        expect(used(['#{v} > 5'])).toEqual(new Set(['v']))
    })

    it('detects A{name}', () => {
        expect(used(['A{v} != ""'])).toEqual(new Set(['v']))
    })

    // Every function whose argument the expression parser reads as a data
    // item, so a quoted name is a reference (ExpressionGrammar.kt).
    it.each([
        "d2:hasValue('v')",
        'd2:hasValue("v")',
        "d2:count('v') > 0",
        "d2:countIfValue('v', '1') > 0",
        "d2:countIfZeroPos('v') > 0",
        "d2:maxValue('v') > 0",
        "d2:minValue('v') > 0",
        "d2:lastEventDate('v') != ''",
        "d2:hasValue ( 'v' )",
    ])('detects a quoted name in %s', (expression) => {
        expect(used([expression])).toEqual(new Set(['v']))
    })

    it('detects #{name} inside the string argument of d2:condition', () => {
        // d2:condition parses its first argument as a nested expression.
        expect(used(["d2:condition('#{v} > 5', 1, 0)"])).toEqual(new Set(['v']))
    })

    it('detects a quoted name with escapes', () => {
        expect(used([String.raw`d2:count('it\'s')`], ["it's"])).toEqual(
            new Set(["it's"])
        )
    })

    it('detects a reference in any of several texts', () => {
        expect(used(['true', "d2:maxValue('v')"])).toEqual(new Set(['v']))
    })

    it('does not match a longer or shorter name', () => {
        expect(
            used(["#{value} > 0 && d2:count('va') > 0"], ['v', 'val'])
        ).toEqual(new Set())
    })

    it('is case-sensitive', () => {
        expect(used(["d2:count('V') > 0"])).toEqual(new Set())
    })

    it('reports nothing when no variable is referenced', () => {
        expect(used(['V{event_date} != ""', '5 > 3'])).toEqual(new Set())
    })
})
