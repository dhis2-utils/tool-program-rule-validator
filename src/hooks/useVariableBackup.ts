import { useDataEngine } from '@dhis2/app-runtime'
import { useCallback, useState } from 'react'
import { downloadJson } from '@/lib/download'

/** Ids per request, so the URL stays well under server limits. */
const CHUNK_SIZE = 100

type VariablesResponse = {
    variables: { programRuleVariables: Record<string, unknown>[] }
}

/**
 * Download the full definition of program rule variables as a metadata file
 * that the Import/Export app can import again.
 */
export const useVariableBackup = () => {
    const engine = useDataEngine()
    const [isDownloading, setIsDownloading] = useState(false)

    const downloadBackup = useCallback(
        async (variableIds: string[]) => {
            setIsDownloading(true)
            try {
                const programRuleVariables: Record<string, unknown>[] = []
                for (let i = 0; i < variableIds.length; i += CHUNK_SIZE) {
                    const ids = variableIds.slice(i, i + CHUNK_SIZE)
                    // oxlint-disable-next-line no-await-in-loop -- one chunk at a time keeps the load on the server low
                    const response = (await engine.query({
                        variables: {
                            resource: 'programRuleVariables',
                            params: {
                                fields: ':owner',
                                filter: `id:in:[${ids.join(',')}]`,
                                paging: false,
                            },
                        },
                    })) as unknown as VariablesResponse
                    programRuleVariables.push(
                        ...response.variables.programRuleVariables
                    )
                }
                const stamp = new Date().toISOString().replaceAll(':', '-')
                downloadJson(
                    { programRuleVariables },
                    `program-rule-variables-${stamp}.json`
                )
            } finally {
                setIsDownloading(false)
            }
        },
        [engine]
    )

    return { downloadBackup, isDownloading }
}
