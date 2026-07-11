import { useDataEngine } from '@dhis2/app-runtime'
import { useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'

export type DeletionOutcome = {
    deletedIds: string[]
    failedIds: string[]
}

/**
 * Delete program rule variables one by one (the metadata API has no bulk
 * delete for single objects), collecting successes and failures so the
 * caller can report both.
 */
export const useDeleteVariables = ({
    onSettled,
}: {
    onSettled: (outcome: DeletionOutcome) => void
}) => {
    const engine = useDataEngine()

    const deleteVariables = useCallback(
        async (variableIds: string[]): Promise<DeletionOutcome> => {
            const outcome: DeletionOutcome = { deletedIds: [], failedIds: [] }
            for (const id of variableIds) {
                try {
                    await engine.mutate({
                        resource: 'programRuleVariables',
                        id,
                        type: 'delete',
                    })
                    outcome.deletedIds.push(id)
                } catch (error) {
                    console.error('Error deleting variable with id:', id, error)
                    outcome.failedIds.push(id)
                }
            }
            return outcome
        },
        [engine]
    )

    const { mutate, isLoading: isDeleting } = useMutation(deleteVariables, {
        onSuccess: (outcome) => onSettled(outcome),
    })

    return { deleteVariables: mutate, isDeleting }
}
