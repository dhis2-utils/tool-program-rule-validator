import { useConfig } from '@dhis2/app-runtime'
import { useCallback } from 'react'
import {
    metadataObjectUrl,
    pickLinkTarget,
    type MenuModule,
    type MetadataObjectType,
} from '@/lib/metadataAppLink'
import { useApiDataQuery } from '@/utils/useApiDataQuery'

type AppsMenuResponse = {
    modules: MenuModule[]
}

/**
 * Resolve where results rows should link to for editing.
 *
 * `apps/menu` lists only the apps the current user may open, so one query
 * answers both "is the app installed" and "may this user use it".
 */
export const useMetadataAppLink = () => {
    const { baseUrl } = useConfig()

    const { data: modules, isLoading } = useApiDataQuery<
        AppsMenuResponse,
        Error,
        MenuModule[]
    >({
        queryKey: ['apps-menu'],
        query: { resource: 'apps/menu' },
        cacheTime: Infinity,
        staleTime: Infinity,
        // A menu we cannot read must not remove the link: pickLinkTarget
        // treats undefined as "fall back to Maintenance".
        retry: false,
        select: (data) => data.modules,
    })

    const target = pickLinkTarget(modules)

    const objectUrl = useCallback(
        (objectType: MetadataObjectType, id: string): string | null =>
            target
                ? metadataObjectUrl({ target, baseUrl, objectType, id })
                : null,
        [target, baseUrl]
    )

    return { target, objectUrl, isLoading }
}
