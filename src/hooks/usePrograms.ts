import type { Program } from '@/types'
import { useApiDataQuery } from '@/utils/useApiDataQuery'

type ProgramsResponse = {
    programs: Program[]
}

export const usePrograms = () => {
    const {
        data: programs,
        isLoading,
        error,
    } = useApiDataQuery<ProgramsResponse, Error, Program[]>({
        queryKey: ['programs'],
        query: {
            resource: 'programs',
            params: {
                fields: 'id,displayName',
                order: 'displayName:asc',
                paging: false,
            },
        },
        cacheTime: Infinity,
        staleTime: Infinity,
        select: (data) => data.programs,
    })

    return { programs, isLoading, error }
}
