import {
    collectUsedVariableNames,
    extractPrvsFromD2HasValue,
    stripStringLiterals,
} from './expressionUsage'

describe('stripStringLiterals', () => {
    it('removes double-quoted literals', () => {
        expect(stripStringLiterals('#{age} > "#{fake}"')).toBe('#{age} > ')
    })

    it('removes single-quoted literals', () => {
        expect(stripStringLiterals("d2:hasValue('foo') == true")).toBe(
            'd2:hasValue() == true'
        )
    })

    it('leaves expressions without literals untouched', () => {
        expect(stripStringLiterals('#{age} > 5')).toBe('#{age} > 5')
    })
})

describe('extractPrvsFromD2HasValue', () => {
    it('extracts single-quoted variable names', () => {
        expect(extractPrvsFromD2HasValue("d2:hasValue('age')")).toEqual(['age'])
    })

    it('extracts double-quoted variable names with whitespace', () => {
        expect(extractPrvsFromD2HasValue('d2:hasValue ( "age" )')).toEqual([
            'age',
        ])
    })

    it('extracts multiple references', () => {
        expect(
            extractPrvsFromD2HasValue("d2:hasValue('a') && d2:hasValue('b')")
        ).toEqual(['a', 'b'])
    })

    it('returns an empty array when there are no references', () => {
        expect(extractPrvsFromD2HasValue('#{age} > 5')).toEqual([])
    })
})

describe('collectUsedVariableNames', () => {
    it('detects #{name} references', () => {
        const used = collectUsedVariableNames(
            ['age', 'sex'],
            ['#{age} > 5'],
            []
        )
        expect(used).toEqual(new Set(['age']))
    })

    it('detects A{name} attribute references', () => {
        const used = collectUsedVariableNames(['nid'], ['A{nid} != ""'], [])
        expect(used).toEqual(new Set(['nid']))
    })

    it('detects d2:hasValue references from raw sources', () => {
        const used = collectUsedVariableNames(
            ['age'],
            ["d2:hasValue('age')"],
            ["d2:hasValue('age')"]
        )
        expect(used).toEqual(new Set(['age']))
    })

    it('ignores references inside string literals', () => {
        const used = collectUsedVariableNames(
            ['age'],
            ['"#{age}" == "text"'],
            []
        )
        expect(used).toEqual(new Set())
    })
})
