/*
 * Turning the per-rule validation results into the grouped shape the UI
 * renders. Kept out of the hook so it can be unit-tested directly.
 */

import type {
    InvalidExpression,
    Program,
    ProgramRule,
    ProgramRuleVariable,
    ValidationResults,
} from '@/types'

export type RuleResult = {
    program: Program
    rule: ProgramRule
    invalidConditionExpressions: string[]
    invalidActionExpressions: string[]
    /** Expressions the server could not be asked for a verdict on. */
    unvalidatedExpressions: number
    usedVariableNames: Set<string>
}

export type ProgramData = {
    program: Program
    rules: ProgramRule[]
    prvs: ProgramRuleVariable[]
}

const toInvalidExpression = (
    program: Program,
    rule: ProgramRule,
    message: string
): InvalidExpression => ({
    programId: program.id,
    programName: program.displayName,
    ruleId: rule.id,
    ruleName: rule.displayName,
    message,
})

/** Collect the variable names each program's rules actually referenced. */
const collectUsedNamesByProgram = (
    ruleResults: RuleResult[]
): Map<string, Set<string>> => {
    const usedByProgramId = new Map<string, Set<string>>()
    for (const { program, usedVariableNames } of ruleResults) {
        let used = usedByProgramId.get(program.id)
        if (!used) {
            used = new Set<string>()
            usedByProgramId.set(program.id, used)
        }
        usedVariableNames.forEach((name) => used?.add(name))
    }
    return usedByProgramId
}

/** Turn the per-rule results into the grouped shape the UI renders. */
export const aggregateResults = ({
    programs,
    programData,
    ruleResults,
}: {
    programs: Program[]
    programData: ProgramData[]
    ruleResults: RuleResult[]
}): ValidationResults => {
    const results: ValidationResults = {
        validatedPrograms: programs,
        invalidConditions: [],
        invalidActions: [],
        unusedVariables: [],
        unvalidatedExpressions: 0,
    }

    for (const ruleResult of ruleResults) {
        const { program, rule } = ruleResult
        results.unvalidatedExpressions += ruleResult.unvalidatedExpressions
        for (const message of ruleResult.invalidConditionExpressions) {
            results.invalidConditions.push(
                toInvalidExpression(program, rule, message)
            )
        }
        for (const message of ruleResult.invalidActionExpressions) {
            results.invalidActions.push(
                toInvalidExpression(program, rule, message)
            )
        }
    }

    const usedByProgramId = collectUsedNamesByProgram(ruleResults)
    for (const { program, prvs } of programData) {
        const used = usedByProgramId.get(program.id)
        for (const prv of prvs) {
            if (!used?.has(prv.name)) {
                results.unusedVariables.push({
                    programId: program.id,
                    programName: program.displayName,
                    variableId: prv.id,
                    variableName: prv.displayName || prv.name,
                })
            }
        }
    }

    return results
}
