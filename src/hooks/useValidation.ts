import { useConfig, useDataEngine } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import pLimit from 'p-limit'
import { useCallback, useRef, useState } from 'react'
import { describeExpression } from '@/lib/expressionDescription'
import { collectUsedVariableNames } from '@/lib/expressionUsage'
import type {
    Program,
    ProgramRule,
    ProgramRuleVariable,
    ValidationResults,
} from '@/types'

const PROGRAM_CONCURRENCY = 4
const RULE_CONCURRENCY = 10

export type ValidationState =
    | { status: 'idle' }
    | { status: 'running'; progress: number }
    | { status: 'done'; results: ValidationResults }
    | { status: 'cancelled' }
    | { status: 'error'; message: string }

type ProgramData = {
    program: Program
    rules: ProgramRule[]
    prvs: ProgramRuleVariable[]
}

type RuleResult = {
    program: Program
    rule: ProgramRule
    invalidConditionExpressions: string[]
    invalidActionExpressions: string[]
    usedVariableNames: Set<string>
}

const isAbortError = (error: unknown): boolean =>
    error instanceof Error && error.name === 'AbortError'

export const useValidation = () => {
    const engine = useDataEngine()
    const { baseUrl } = useConfig()
    const [state, setState] = useState<ValidationState>({ status: 'idle' })
    const controllerRef = useRef<AbortController | null>(null)

    const cancel = useCallback(() => {
        controllerRef.current?.abort()
    }, [])

    /** Remove deleted variables from the current results. */
    const removeUnusedVariables = useCallback((variableIds: string[]) => {
        const removed = new Set(variableIds)
        setState((current) =>
            current.status === 'done'
                ? {
                      ...current,
                      results: {
                          ...current.results,
                          unusedVariables:
                              current.results.unusedVariables.filter(
                                  (variable) =>
                                      !removed.has(variable.variableId)
                              ),
                      },
                  }
                : current
        )
    }, [])

    const processRule = useCallback(
        async ({
            program,
            rule,
            prvNames,
            signal,
        }: {
            program: Program
            rule: ProgramRule
            prvNames: string[]
            signal: AbortSignal
        }): Promise<RuleResult> => {
            const usedVariableNames = new Set<string>()
            const invalidConditionExpressions: string[] = []
            const invalidActionExpressions: string[] = []

            if (rule.condition) {
                collectUsedVariableNames(
                    prvNames,
                    [rule.condition],
                    [rule.condition]
                ).forEach((name) => usedVariableNames.add(name))
                const error = await describeExpression({
                    baseUrl,
                    path: `programRules/condition/description?programId=${program.id}`,
                    expression: rule.condition,
                    fallbackErrorMessage: i18n.t('Condition validation error'),
                    signal,
                })
                if (error) {
                    invalidConditionExpressions.push(error)
                }
            }

            for (const action of rule.programRuleActions ?? []) {
                const texts = [action.content || '', action.data || '']
                collectUsedVariableNames(prvNames, texts, texts).forEach(
                    (name) => usedVariableNames.add(name)
                )
                if (action.data) {
                    const error = await describeExpression({
                        baseUrl,
                        path: `programRuleActions/data/expression/description?programId=${program.id}`,
                        expression: action.data,
                        fallbackErrorMessage: i18n.t(
                            'Action expression validation error'
                        ),
                        signal,
                    })
                    if (error) {
                        invalidActionExpressions.push(error)
                    }
                }
            }

            return {
                program,
                rule,
                invalidConditionExpressions,
                invalidActionExpressions,
                usedVariableNames,
            }
        },
        [baseUrl]
    )

    const start = useCallback(
        async (programs: Program[]) => {
            const controller = new AbortController()
            controllerRef.current = controller
            const { signal } = controller
            setState({ status: 'running', progress: 0 })

            try {
                // Phase 1: fetch rules + variables for each program
                const programLimit = pLimit(PROGRAM_CONCURRENCY)
                const ruleLimit = pLimit(RULE_CONCURRENCY)
                const programData: ProgramData[] = await Promise.all(
                    programs.map((program) =>
                        programLimit(async () => {
                            const response = (await engine.query(
                                {
                                    rules: {
                                        resource: 'programRules',
                                        params: {
                                            fields: 'id,displayName,condition,programRuleActions[data,content]',
                                            filter: `program.id:eq:${program.id}`,
                                            paging: false,
                                        },
                                    },
                                    variables: {
                                        resource: 'programRuleVariables',
                                        params: {
                                            fields: 'id,name,displayName',
                                            filter: `program.id:eq:${program.id}`,
                                            paging: false,
                                        },
                                    },
                                },
                                { signal }
                            )) as {
                                rules: { programRules: ProgramRule[] }
                                variables: {
                                    programRuleVariables: ProgramRuleVariable[]
                                }
                            }
                            return {
                                program,
                                rules: response.rules.programRules,
                                prvs: response.variables.programRuleVariables,
                            }
                        })
                    )
                )

                // Phase 2: validate every rule, sharing one concurrency limit
                // across programs so we don't swamp the DHIS2 server
                const totalRules = programData.reduce(
                    (count, data) => count + data.rules.length,
                    0
                )
                let completedRules = 0
                const updateProgress = () => {
                    completedRules++
                    const progress =
                        totalRules > 0
                            ? (completedRules / totalRules) * 100
                            : 100
                    setState((current) =>
                        current.status === 'running'
                            ? { status: 'running', progress }
                            : current
                    )
                }

                const ruleResults: RuleResult[] = await Promise.all(
                    programData.flatMap(({ program, rules, prvs }) => {
                        const prvNames = prvs.map((prv) => prv.name)
                        return rules.map((rule) =>
                            ruleLimit(async () => {
                                const result = await processRule({
                                    program,
                                    rule,
                                    prvNames,
                                    signal,
                                })
                                updateProgress()
                                return result
                            })
                        )
                    })
                )

                // Phase 3: aggregate results, grouped by program
                const results: ValidationResults = {
                    validatedPrograms: programs,
                    invalidConditions: [],
                    invalidActions: [],
                    unusedVariables: [],
                }

                const usedByProgramId = new Map<string, Set<string>>()
                for (const ruleResult of ruleResults) {
                    const { program, rule } = ruleResult
                    let used = usedByProgramId.get(program.id)
                    if (!used) {
                        used = new Set<string>()
                        usedByProgramId.set(program.id, used)
                    }
                    ruleResult.usedVariableNames.forEach((name) =>
                        used?.add(name)
                    )
                    for (const message of ruleResult.invalidConditionExpressions) {
                        results.invalidConditions.push({
                            programId: program.id,
                            programName: program.displayName,
                            ruleId: rule.id,
                            ruleName: rule.displayName,
                            message,
                        })
                    }
                    for (const message of ruleResult.invalidActionExpressions) {
                        results.invalidActions.push({
                            programId: program.id,
                            programName: program.displayName,
                            ruleId: rule.id,
                            ruleName: rule.displayName,
                            message,
                        })
                    }
                }

                for (const { program, prvs } of programData) {
                    const used =
                        usedByProgramId.get(program.id) ?? new Set<string>()
                    for (const prv of prvs) {
                        if (!used.has(prv.name)) {
                            results.unusedVariables.push({
                                programId: program.id,
                                programName: program.displayName,
                                variableId: prv.id,
                                variableName: prv.displayName || prv.name,
                            })
                        }
                    }
                }

                setState({ status: 'done', results })
            } catch (error) {
                if (isAbortError(error) || signal.aborted) {
                    setState({ status: 'cancelled' })
                    return
                }
                console.error('Validation failed', error)
                setState({
                    status: 'error',
                    message:
                        error instanceof Error
                            ? error.message
                            : i18n.t('Validation failed'),
                })
            } finally {
                controllerRef.current = null
            }
        },
        [engine, processRule]
    )

    return { state, start, cancel, removeUnusedVariables }
}
