import { useConfig } from '@dhis2/app-runtime'
import { useCallback } from 'react'
import { metadataObjectUrl, pickLinkTarget } from '@/lib/metadataAppLink'
import type {
    LinkTarget,
    MenuModule,
    MetadataObjectType,
} from '@/lib/metadataAppLink'
import { useApiDataQuery } from '@/utils/useApiDataQuery'

/** Where to edit one object, and the app that the link opens. */
export interface EditLink {
    url: string
    target: LinkTarget
    /** The app's name from the menu, if the menu could be read. */
    appName?: string
}

interface AppsMenuResponse {
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

    /** Where to edit one object: the URL and the app it opens, or null. */
    const editLink = useCallback(
        (objectType: MetadataObjectType, id: string): EditLink | null => {
            const resolution = pickLinkTarget(modules, objectType)
            if (!resolution) {
                return null
            }
            return {
                target: resolution.target,
                appName: resolution.appName,
                url: metadataObjectUrl({
                    target: resolution.target,
                    launchUrl: resolution.launchUrl,
                    fallbackPath: resolution.fallbackPath,
                    baseUrl,
                    objectType,
                    id,
                }),
            }
        },
        [modules, baseUrl]
    )

    return { editLink, isLoading }
}
