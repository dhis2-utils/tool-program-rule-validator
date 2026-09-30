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
 * answers both "is the app installed" and "may this user use it", and it
 * reports each app's launch URL.
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

    const resolution = pickLinkTarget(modules)

    const objectUrl = useCallback(
        (objectType: MetadataObjectType, id: string): string | null =>
            resolution
                ? metadataObjectUrl({
                      target: resolution.target,
                      launchUrl: resolution.launchUrl,
                      baseUrl,
                      objectType,
                      id,
                  })
                : null,
        [resolution, baseUrl]
    )

    return { target: resolution?.target ?? null, objectUrl, isLoading }
}
