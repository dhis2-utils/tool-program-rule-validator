import { useDataEngine } from '@dhis2/app-runtime'
import { useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'
import { idsReferencedByRules } from '@/lib/ruleTexts'
import type { ProgramRule, UnusedVariable } from '@/types'

export type DeletionOutcome = {
    deletedIds: string[]
    failedIds: string[]
    /** Variables a rule references now, although the results said unused. */
    nowUsedIds: string[]
    /** The server's message for the first failed delete, if any. */
    firstError?: string
}

type RulesResponse = { rules: { programRules: ProgramRule[] } }

/** The message to show for a failed request, preferring the server's own. */
const errorMessage = (error: unknown): string | undefined => {
    const details = (error as { details?: { message?: string } })?.details
    return details?.message || (error as Error)?.message || undefined
}

/**
 * Delete program rule variables one by one (the metadata API has no bulk
 * delete for single objects), collecting successes and failures so the
 * caller can report both.
 *
 * Results can be stale: someone may have added a rule since the validation
 * ran. So the rules of each affected program are read again first, and a
 * variable that a rule now references is left alone.
 */
export const useDeleteVariables = ({
    onSettled,
}: {
    onSettled: (outcome: DeletionOutcome) => void
}) => {
    const engine = useDataEngine()

    const findNowUsed = useCallback(
        async (variables: UnusedVariable[]): Promise<Set<string>> => {
            const nowUsed = new Set<string>()
            const programIds = [...new Set(variables.map((v) => v.programId))]
            for (const programId of programIds) {
                // oxlint-disable-next-line no-await-in-loop -- one program at a time keeps the load on the server low
                const response = (await engine.query({
                    rules: {
                        resource: 'programRules',
                        params: {
                            fields: 'condition,programRuleActions[data,content]',
                            filter: `program.id:eq:${programId}`,
                            paging: false,
                        },
                    },
                })) as unknown as RulesResponse
                const inProgram = variables.filter(
                    (v) => v.programId === programId
                )
                idsReferencedByRules(
                    inProgram,
                    response.rules.programRules
                ).forEach((id) => nowUsed.add(id))
            }
            return nowUsed
        },
        [engine]
    )

    const deleteVariables = useCallback(
        async (variables: UnusedVariable[]): Promise<DeletionOutcome> => {
            const outcome: DeletionOutcome = {
                deletedIds: [],
                failedIds: [],
                nowUsedIds: [],
            }
            const nowUsed = await findNowUsed(variables)
            outcome.nowUsedIds = [...nowUsed]
            for (const variable of variables) {
                if (nowUsed.has(variable.variableId)) {
                    continue
                }
                try {
                    // oxlint-disable-next-line no-await-in-loop -- one delete at a time, so a failure is attributed to its variable
                    await engine.mutate({
                        resource: 'programRuleVariables',
                        id: variable.variableId,
                        type: 'delete',
                    })
                    outcome.deletedIds.push(variable.variableId)
                } catch (error) {
                    console.error(
                        'Error deleting variable with id:',
                        variable.variableId,
                        error
                    )
                    outcome.failedIds.push(variable.variableId)
                    outcome.firstError ??= errorMessage(error)
                }
            }
            return outcome
        },
        [engine, findNowUsed]
    )

    const { mutate, isLoading: isDeleting } = useMutation(deleteVariables, {
        onSuccess: (outcome) => onSettled(outcome),
        // Re-reading the rules failed, so nothing was deleted.
        onError: (error) =>
            onSettled({
                deletedIds: [],
                failedIds: [],
                nowUsedIds: [],
                firstError: errorMessage(error),
            }),
    })

    return { deleteVariables: mutate, isDeleting }
}
