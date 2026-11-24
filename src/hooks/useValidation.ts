import { useConfig, useDataEngine } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import pLimit from 'p-limit'
import { useCallback, useRef, useState } from 'react'
import { describeExpression } from '@/lib/expressionDescription'
import { collectUsedVariableNames } from '@/lib/expressionUsage'
import {
    aggregateResults,
    type ProgramData,
    type RuleResult,
} from '@/lib/validationResults'
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
    | { status: 'done' }
    | { status: 'cancelled' }
    | { status: 'error'; message: string }

const isAbortError = (error: unknown): boolean =>
    error instanceof Error && error.name === 'AbortError'

/** Thrown when the server answers 401: the run cannot continue. */
class SessionExpiredError extends Error {
    constructor() {
        super('Session expired')
        this.name = 'SessionExpiredError'
    }
}

const isSessionExpired = (error: unknown): boolean =>
    error instanceof SessionExpiredError ||
    // The data engine reports a 401 as an access error with this message.
    (error instanceof Error &&
        (error as Error & { type?: string }).type === 'access' &&
        error.message === 'Unauthorized')

export const useValidation = () => {
    const engine = useDataEngine()
    const { baseUrl, apiVersion } = useConfig()
    const [state, setState] = useState<ValidationState>({ status: 'idle' })
    // Results are held separately from the run status so that cancelling or
    // failing a later run leaves the last completed run's results in place,
    // rather than forcing the user to validate everything again.
    const [results, setResults] = useState<ValidationResults | null>(null)
    // Changes with every completed run, so views can reset their own state
    // (filters, ticked rows) for new results but keep it across deletions.
    const [runId, setRunId] = useState(0)
    const controllerRef = useRef<AbortController | null>(null)

    const cancel = useCallback(() => {
        controllerRef.current?.abort()
    }, [])

    /** Remove deleted variables from the current results. */
    const removeUnusedVariables = useCallback((variableIds: string[]) => {
        const removed = new Set(variableIds)
        setResults((current) =>
            current
                ? {
                      ...current,
                      unusedVariables: current.unusedVariables.filter(
                          (variable) => !removed.has(variable.variableId)
                      ),
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
            let unvalidatedExpressions = 0

            if (rule.condition) {
                collectUsedVariableNames(prvNames, [rule.condition]).forEach(
                    (name) => usedVariableNames.add(name)
                )
                const result = await describeExpression({
                    baseUrl,
                    apiVersion,
                    path: `programRules/condition/description?programId=${program.id}`,
                    expression: rule.condition,
                    signal,
                })
                if (result.status === 'invalid') {
                    invalidConditionExpressions.push(
                        result.message || i18n.t('Condition validation error')
                    )
                } else if (result.status === 'unavailable') {
                    unvalidatedExpressions++
                } else if (result.status === 'unauthorized') {
                    throw new SessionExpiredError()
                }
            }

            for (const action of rule.programRuleActions ?? []) {
                const texts = [action.content || '', action.data || '']
                collectUsedVariableNames(prvNames, texts).forEach((name) =>
                    usedVariableNames.add(name)
                )
                if (action.data) {
                    const result = await describeExpression({
                        baseUrl,
                        apiVersion,
                        path: `programRuleActions/data/expression/description?programId=${program.id}`,
                        expression: action.data,
                        signal,
                    })
                    if (result.status === 'invalid') {
                        invalidActionExpressions.push(
                            result.message ||
                                i18n.t('Action expression validation error')
                        )
                    } else if (result.status === 'unavailable') {
                        unvalidatedExpressions++
                    } else if (result.status === 'unauthorized') {
                        throw new SessionExpiredError()
                    }
                }
            }

            return {
                program,
                rule,
                invalidConditionExpressions,
                invalidActionExpressions,
                unvalidatedExpressions,
                usedVariableNames,
            }
        },
        [baseUrl, apiVersion]
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
                setResults(
                    aggregateResults({ programs, programData, ruleResults })
                )
                setRunId((id) => id + 1)
                setState({ status: 'done' })
            } catch (error) {
                if (isSessionExpired(error)) {
                    // Stop the requests still queued or in flight.
                    controller.abort()
                    setState({
                        status: 'error',
                        message: i18n.t(
                            'Your session has ended. Log in again, then run the validation again.'
                        ),
                    })
                    return
                }
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

    return { state, results, runId, start, cancel, removeUnusedVariables }
}
