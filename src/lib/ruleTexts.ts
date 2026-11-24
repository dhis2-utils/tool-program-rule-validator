import { collectUsedVariableNames } from './expressionUsage'
import type { ProgramRule, UnusedVariable } from '@/types'

/** Every text of a rule that can reference a variable. */
export const ruleTexts = (rule: ProgramRule): string[] => [
    rule.condition ?? '',
    ...(rule.programRuleActions ?? []).flatMap((action) => [
        action.data ?? '',
        action.content ?? '',
    ]),
]

/**
 * Of `variables` (all in one program), the ids of those that one of the
 * program's `rules` references.
 */
export const idsReferencedByRules = (
    variables: UnusedVariable[],
    rules: ProgramRule[]
): Set<string> => {
    const used = collectUsedVariableNames(
        variables.map((variable) => variable.name),
        rules.flatMap(ruleTexts)
    )
    return new Set(
        variables
            .filter((variable) => used.has(variable.name))
            .map((variable) => variable.variableId)
    )
}
