import { idsReferencedByRules, ruleTexts } from './ruleTexts'
import type { UnusedVariable } from '@/types'

const variable = (id: string, name: string): UnusedVariable => ({
    programId: 'p1',
    programName: 'Program 1',
    variableId: id,
    name,
    variableName: `Display ${name}`,
})

describe('ruleTexts', () => {
    it('returns the condition and every action data and content', () => {
        expect(
            ruleTexts({
                id: 'r1',
                displayName: 'Rule 1',
                condition: 'c',
                programRuleActions: [{ data: 'd1', content: 't1' }, {}],
            })
        ).toEqual(['c', 'd1', 't1', '', ''])
    })

    it('copes with a rule without condition or actions', () => {
        expect(ruleTexts({ id: 'r1', displayName: 'Rule 1' })).toEqual([''])
    })
})

describe('idsReferencedByRules', () => {
    it('returns the variables a rule now references, by name', () => {
        const ids = idsReferencedByRules(
            [variable('v1', 'a'), variable('v2', 'b'), variable('v3', 'c')],
            [
                { id: 'r1', displayName: 'R1', condition: "d2:count('a') > 0" },
                {
                    id: 'r2',
                    displayName: 'R2',
                    programRuleActions: [{ content: '#{c}' }],
                },
            ]
        )
        expect(ids).toEqual(new Set(['v1', 'v3']))
    })

    it('matches on the name, not the display name', () => {
        expect(
            idsReferencedByRules(
                [variable('v1', 'a')],
                [{ id: 'r1', displayName: 'R1', condition: '#{Display a}' }]
            )
        ).toEqual(new Set())
    })

    it('returns nothing when there are no rules', () => {
        expect(idsReferencedByRules([variable('v1', 'a')], [])).toEqual(
            new Set()
        )
    })
})
