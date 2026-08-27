/*
 * Deep links from a results row to the app where the object can be edited.
 *
 * DHIS2 is midway through replacing the legacy Maintenance app with the
 * Metadata Management app (installable from the App Hub on 2.41, bundled from
 * 2.42). Which one to link to therefore depends on the instance and on the
 * user's authorities, so the target is resolved at runtime from the app menu.
 */

export type LinkTarget = 'metadata-management' | 'maintenance'
export type MetadataObjectType = 'programRule' | 'programRuleVariable'

/** One entry of `GET /api/apps/menu`, which only lists apps the user may open. */
export type MenuModule = { name: string }

const METADATA_MANAGEMENT_MODULE = 'metadata-management'
const MAINTENANCE_MODULE = 'dhis-web-maintenance'

/** Route segment for each object type in the Metadata Management app. */
const METADATA_MANAGEMENT_SECTION: Record<MetadataObjectType, string> = {
    programRule: 'programRules',
    programRuleVariable: 'programRuleVariables',
}

/**
 * Choose which app to link to, preferring Metadata Management.
 *
 * `undefined` means the menu could not be read (an old version, a failed
 * request). That is not evidence the user lacks Maintenance, so we keep
 * linking there rather than dropping the link.
 */
export const pickLinkTarget = (
    modules: MenuModule[] | undefined
): LinkTarget | null => {
    if (!modules) {
        return 'maintenance'
    }
    const names = new Set(modules.map((module) => module.name))
    if (names.has(METADATA_MANAGEMENT_MODULE)) {
        return 'metadata-management'
    }
    if (names.has(MAINTENANCE_MODULE)) {
        return 'maintenance'
    }
    return null
}

/** Build the edit URL for one metadata object in the chosen app. */
export const metadataObjectUrl = ({
    target,
    baseUrl,
    objectType,
    id,
}: {
    target: LinkTarget
    baseUrl: string
    objectType: MetadataObjectType
    id: string
}): string => {
    const base = baseUrl.replace(/\/+$/, '')
    const path =
        target === 'metadata-management'
            ? `api/apps/metadata-management/index.html#/${METADATA_MANAGEMENT_SECTION[objectType]}/${id}`
            : `dhis-web-maintenance/index.html#/edit/programSection/${objectType}/${id}`
    // Resolve like the engine does, so a relative baseUrl still yields an
    // absolute URL for window.open.
    return new URL(`${base}/${path}`, window.location.href).href
}
