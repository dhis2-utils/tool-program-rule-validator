import { useDataEngine } from '@dhis2/app-runtime'
import {
    useQuery,
    QueryFunction,
    UseQueryOptions,
    QueryKey,
} from '@tanstack/react-query'

// app-runtime does not export its query types, so take them from the engine.
type ResourceQuery = Parameters<
    ReturnType<typeof useDataEngine>['query']
>[0][string]

type UseApiDataQueryProps<
    TResultData,
    TError = Error,
    TData = TResultData,
    TQueryKey extends QueryKey = QueryKey,
> = Omit<UseQueryOptions<TResultData, TError, TData, TQueryKey>, 'queryFn'> & {
    query: ResourceQuery
}

export const useApiDataQuery = <
    TResultData,
    TError = Error,
    TData = TResultData,
    TQueryKey extends QueryKey = QueryKey,
>({
    query,
    queryKey,
    ...options
}: UseApiDataQueryProps<TResultData, TError, TData, TQueryKey>) => {
    const dataEngine = useDataEngine()

    const queryFn: QueryFunction<TResultData, TQueryKey> = async () => {
        const response = await dataEngine.query({ apiDataQuery: query })
        return response.apiDataQuery as TResultData
    }

    return useQuery<TResultData, TError, TData, TQueryKey>({
        queryKey,
        queryFn,
        ...options,
    })
}
