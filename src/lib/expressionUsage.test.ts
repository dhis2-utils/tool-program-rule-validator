import { collectUsedVariableNames, extractQuotedNames } from './expressionUsage'

describe('extractQuotedNames', () => {
    it('extracts single-quoted names', () => {
        expect(extractQuotedNames("d2:hasValue('age')")).toEqual(['age'])
    })

    it('extracts double-quoted names and trims whitespace', () => {
        expect(extractQuotedNames('d2:hasValue ( " age " )')).toEqual(['age'])
    })

    it('extracts multiple names', () => {
        expect(
            extractQuotedNames("d2:hasValue('a') && d2:count('b') > 1")
        ).toEqual(['a', 'b'])
    })

    it('returns an empty array when there are no literals', () => {
        expect(extractQuotedNames('#{age} > 5')).toEqual([])
    })
})

describe('collectUsedVariableNames', () => {
    it('detects #{name} references', () => {
        const used = collectUsedVariableNames(['age', 'sex'], ['#{age} > 5'])
        expect(used).toEqual(new Set(['age']))
    })

    it('detects A{name} attribute references', () => {
        const used = collectUsedVariableNames(['nid'], ['A{nid} != ""'])
        expect(used).toEqual(new Set(['nid']))
    })

    it('does not match a name that is only a prefix of a reference', () => {
        const used = collectUsedVariableNames(['age'], ['#{age_months} > 5'])
        expect(used).toEqual(new Set())
    })

    it('detects names with dots, spaces and regex characters', () => {
        const used = collectUsedVariableNames(
            ['weight (kg)', 'a.b', 'x+y'],
            ['#{weight (kg)} > 5 && #{a.b} == 1', "d2:hasValue('x+y')"]
        )
        expect(used).toEqual(new Set(['weight (kg)', 'a.b', 'x+y']))
    })

    it.each([
        "d2:hasValue('visits')",
        "d2:count('visits') > 2",
        "d2:countIfValue('visits', 1) > 0",
        "d2:countIfZeroPos('visits') > 0",
        "d2:maxValue('visits') > 3",
        "d2:minValue('visits') < 1",
        "d2:lastEventDate('visits') != ''",
        'd2:count("visits") > 2',
    ])('detects a name passed as a quoted argument: %s', (expression) => {
        const used = collectUsedVariableNames(['visits'], [expression])
        expect(used).toEqual(new Set(['visits']))
    })

    it('detects references inside the condition argument of d2:countIfCondition', () => {
        const used = collectUsedVariableNames(
            ['a', 'b'],
            ["d2:countIfCondition(#{a}, '#{b} > 3') > 0"]
        )
        expect(used).toEqual(new Set(['a', 'b']))
    })

    it('detects references in display text that contains apostrophes', () => {
        const used = collectUsedVariableNames(
            ['weight'],
            ["Don't forget #{weight}, it's required"]
        )
        expect(used).toEqual(new Set(['weight']))
    })

    it('counts a reference inside a string literal as used', () => {
        const used = collectUsedVariableNames(['age'], ['"#{age}" == "text"'])
        expect(used).toEqual(new Set(['age']))
    })

    it('reports nothing for texts that reference no variable', () => {
        const used = collectUsedVariableNames(['age'], ['true', ''])
        expect(used).toEqual(new Set())
    })
})
