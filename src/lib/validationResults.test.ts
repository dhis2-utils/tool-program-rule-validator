import type { Program, ProgramRule } from '../types'
import { aggregateResults } from './validationResults'

const program = (id: string): Program => ({ id, displayName: `Program ${id}` })
const rule = (id: string): ProgramRule => ({ id, displayName: `Rule ${id}` })

const ruleResult = (
    p: Program,
    r: ProgramRule,
    overrides: Partial<{
        invalidConditionExpressions: string[]
        invalidActionExpressions: string[]
        unvalidatedExpressions: number
        usedVariableNames: Set<string>
    }> = {}
) => ({
    program: p,
    rule: r,
    invalidConditionExpressions: [],
    invalidActionExpressions: [],
    unvalidatedExpressions: 0,
    usedVariableNames: new Set<string>(),
    ...overrides,
})

const prv = (id: string, name: string) => ({ id, name, displayName: name })

describe('aggregateResults', () => {
    const p1 = program('p1')

    it('lists a variable no rule referenced as unused', () => {
        const results = aggregateResults({
            programs: [p1],
            programData: [
                { program: p1, rules: [], prvs: [prv('v1', 'unused_var')] },
            ],
            ruleResults: [],
        })

        expect(results.unusedVariables).toEqual([
            {
                programId: 'p1',
                programName: 'Program p1',
                variableId: 'v1',
                variableName: 'unused_var',
            },
        ])
    })

    it('omits a variable that a rule referenced', () => {
        const results = aggregateResults({
            programs: [p1],
            programData: [
                { program: p1, rules: [], prvs: [prv('v1', 'used_var')] },
            ],
            ruleResults: [
                ruleResult(p1, rule('r1'), {
                    usedVariableNames: new Set(['used_var']),
                }),
            ],
        })

        expect(results.unusedVariables).toEqual([])
    })

    it('counts a variable as used when any rule in the program uses it', () => {
        // Usage must be pooled across rules, not judged rule by rule.
        const results = aggregateResults({
            programs: [p1],
            programData: [
                { program: p1, rules: [], prvs: [prv('v1', 'shared_var')] },
            ],
            ruleResults: [
                ruleResult(p1, rule('r1')),
                ruleResult(p1, rule('r2'), {
                    usedVariableNames: new Set(['shared_var']),
                }),
            ],
        })

        expect(results.unusedVariables).toEqual([])
    })

    it('does not let usage in one program mask an unused variable in another', () => {
        const p2 = program('p2')
        const results = aggregateResults({
            programs: [p1, p2],
            programData: [
                { program: p1, rules: [], prvs: [prv('v1', 'shared_name')] },
                { program: p2, rules: [], prvs: [prv('v2', 'shared_name')] },
            ],
            ruleResults: [
                ruleResult(p1, rule('r1'), {
                    usedVariableNames: new Set(['shared_name']),
                }),
            ],
        })

        expect(results.unusedVariables).toEqual([
            {
                programId: 'p2',
                programName: 'Program p2',
                variableId: 'v2',
                variableName: 'shared_name',
            },
        ])
    })

    it('groups invalid conditions and actions with their rule', () => {
        const r1 = rule('r1')
        const results = aggregateResults({
            programs: [p1],
            programData: [{ program: p1, rules: [r1], prvs: [] }],
            ruleResults: [
                ruleResult(p1, r1, {
                    invalidConditionExpressions: ['bad condition'],
                    invalidActionExpressions: ['bad action'],
                }),
            ],
        })

        expect(results.invalidConditions).toEqual([
            {
                programId: 'p1',
                programName: 'Program p1',
                ruleId: 'r1',
                ruleName: 'Rule r1',
                message: 'bad condition',
            },
        ])
        expect(results.invalidActions).toHaveLength(1)
        expect(results.invalidActions[0].message).toBe('bad action')
    })

    it('sums unvalidated expressions across rules', () => {
        const results = aggregateResults({
            programs: [p1],
            programData: [{ program: p1, rules: [], prvs: [] }],
            ruleResults: [
                ruleResult(p1, rule('r1'), { unvalidatedExpressions: 2 }),
                ruleResult(p1, rule('r2'), { unvalidatedExpressions: 3 }),
            ],
        })

        expect(results.unvalidatedExpressions).toBe(5)
    })

    it('prefers displayName over name for the variable label', () => {
        const results = aggregateResults({
            programs: [p1],
            programData: [
                {
                    program: p1,
                    rules: [],
                    prvs: [{ id: 'v1', name: 'raw', displayName: 'Pretty' }],
                },
            ],
            ruleResults: [],
        })

        expect(results.unusedVariables[0].variableName).toBe('Pretty')
    })
})
