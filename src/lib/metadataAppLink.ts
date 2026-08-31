/*
 * Deep links from a results row to the app where the object can be edited.
 *
 * DHIS2 is midway through replacing the legacy Maintenance app with the
 * Metadata Management app, so which one to link to depends on the instance and
 * on the user's authorities. Both are resolved at runtime from the app menu.
 *
 * The same app appears under two different names and at two different paths
 * depending on how it got there, so neither can be hardcoded:
 *
 *   bundled (2.42+)   menu name "dhis-web-metadata-management"
 *                     at {base}/dhis-web-metadata-management/index.html
 *   App Hub install   menu name "metadata-management"
 *                     at {base}/api/apps/metadata-management/index.html
 *
 * The menu reports the launch URL for whichever is present, so we use that and
 * only fall back to a constructed path when it is missing or unusable.
 */

import { trimTrailingSlashes } from './path'

export type LinkTarget = 'metadata-management' | 'maintenance'
export type MetadataObjectType = 'programRule' | 'programRuleVariable'

/** One entry of `GET /api/apps/menu`, which only lists apps the user may open. */
export type MenuModule = {
    name: string
    /** Absolute launch URL on current servers; older ones report a relative path. */
    defaultAction?: string
}

export type LinkResolution = {
    target: LinkTarget
    launchUrl?: string
}

const METADATA_MANAGEMENT_MODULES = [
    'dhis-web-metadata-management',
    'metadata-management',
]
const MAINTENANCE_MODULE = 'dhis-web-maintenance'

/** Route segment for each object type in the Metadata Management app. */
const METADATA_MANAGEMENT_SECTION: Record<MetadataObjectType, string> = {
    programRule: 'programRules',
    programRuleVariable: 'programRuleVariables',
}

/** Used only when the menu reports no usable launch URL. */
const FALLBACK_APP_PATH: Record<LinkTarget, string> = {
    'metadata-management': 'api/apps/metadata-management/index.html',
    maintenance: 'dhis-web-maintenance/index.html',
}

/**
 * Choose which app to link to, preferring Metadata Management, and carry the
 * launch URL the server reported for it.
 *
 * `undefined` means the menu could not be read (an old version, a failed
 * request). That is not evidence the user lacks Maintenance, so we keep
 * linking there rather than dropping the link.
 */
export const pickLinkTarget = (
    modules: MenuModule[] | undefined
): LinkResolution | null => {
    if (!modules) {
        return { target: 'maintenance' }
    }
    const find = (name: string) =>
        modules.find((module) => module.name === name)

    for (const name of METADATA_MANAGEMENT_MODULES) {
        const found = find(name)
        if (found) {
            return {
                target: 'metadata-management',
                launchUrl: found.defaultAction,
            }
        }
    }
    const maintenance = find(MAINTENANCE_MODULE)
    if (maintenance) {
        return {
            target: 'maintenance',
            launchUrl: maintenance.defaultAction,
        }
    }
    return null
}

const isAbsolute = (url: string | undefined): url is string =>
    !!url && /^https?:\/\//.test(url)

/** Build the edit URL for one metadata object in the chosen app. */
export const metadataObjectUrl = ({
    target,
    launchUrl,
    baseUrl,
    objectType,
    id,
}: {
    target: LinkTarget
    launchUrl?: string
    baseUrl: string
    objectType: MetadataObjectType
    id: string
}): string => {
    // A relative defaultAction (e.g. "../dhis-web-maintenance/index.html") is
    // resolved against a location this app does not share, so ignore it and
    // build from baseUrl instead.
    const appUrl = isAbsolute(launchUrl)
        ? launchUrl
        : `${trimTrailingSlashes(baseUrl)}/${FALLBACK_APP_PATH[target]}`

    const route =
        target === 'metadata-management'
            ? `#/${METADATA_MANAGEMENT_SECTION[objectType]}/${id}`
            : `#/edit/programSection/${objectType}/${id}`

    return new URL(`${appUrl}${route}`, window.location.href).href
}
