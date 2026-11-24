/*
 * Deep links from a results row to the app where the object can be edited.
 *
 * DHIS2 is midway through replacing the legacy Maintenance app with the
 * Metadata Management app, so which one to link to depends on the instance and
 * on the user's authorities. Both are resolved at runtime from the app menu.
 *
 * The same app appears under three names and at different paths depending on
 * how it got there, so none can be hardcoded:
 *
 *   bundled (2.43+)        menu name "dhis-web-metadata-management"
 *                          at {base}/dhis-web-metadata-management/index.html
 *   App Hub, 0.147.0+      menu name "metadata-management"
 *                          at {base}/api/apps/metadata-management/index.html
 *   App Hub, before that   menu name "maintenance-preview", titled
 *                          "Maintenance (Preview)", at
 *                          {base}/api/apps/maintenance-preview/index.html
 *
 * The menu reports the launch URL for whichever is present, so we use that and
 * only fall back to a constructed path when it is missing or unusable.
 *
 * Metadata Management gained its edit screens one object type at a time, so
 * an older bundled or App Hub version can lack the screen a link needs. The
 * menu reports each app's version; below the minimum for an object type, the
 * link goes to Maintenance instead.
 */

import { trimTrailingSlashes } from './path'

export type LinkTarget = 'metadata-management' | 'maintenance'
export type MetadataObjectType = 'programRule' | 'programRuleVariable'

/** One entry of `GET /api/apps/menu`, which only lists apps the user may open. */
export interface MenuModule {
    name: string
    /** Absolute launch URL on current servers; older ones report a relative path. */
    defaultAction?: string
    /** The app's version, such as "0.179.0". */
    version?: string
    /** The app's name as the menu shows it, in the user's language. */
    displayName?: string
}

export interface LinkResolution {
    target: LinkTarget
    launchUrl?: string
    /** The app's name from the menu, for the link's tooltip. */
    appName?: string
    /** Where the app lives, relative to the server, if no usable launch URL. */
    fallbackPath?: string
}

const METADATA_MANAGEMENT_MODULES = [
    'dhis-web-metadata-management',
    'metadata-management',
    'maintenance-preview',
]
const MAINTENANCE_MODULE = 'dhis-web-maintenance'

/** The module to assume when the menu could not be read. */
const DEFAULT_MODULE: Record<LinkTarget, string> = {
    'metadata-management': 'dhis-web-metadata-management',
    maintenance: MAINTENANCE_MODULE,
}

/** Route segment for each object type in the Metadata Management app. */
const METADATA_MANAGEMENT_SECTION: Record<MetadataObjectType, string> = {
    programRule: 'programRules',
    programRuleVariable: 'programRuleVariables',
}

/**
 * The first Metadata Management version with an edit screen for each object
 * type (dhis2/maintenance-app-beta: src/pages/programRuleVariables/Edit.tsx
 * first shipped in v0.119.0, src/pages/programRules/Edit.tsx in v0.135.0).
 */
export const METADATA_MANAGEMENT_MIN_VERSION: Record<
    MetadataObjectType,
    string
> = {
    programRule: '0.135.0',
    programRuleVariable: '0.119.0',
}

/**
 * Compare dotted version strings by number: -1, 0 or 1. Only the part before
 * a "-" counts ("0.135.0-beta.1" equals "0.135.0"). A part that is not a
 * number, or is missing, counts as 0 ("1.2" equals "1.2.0").
 */
const versionParts = (version: string): number[] =>
    version
        .split('-')[0]
        .split('.')
        .map((part) => Number.parseInt(part, 10) || 0)

export const compareVersions = (a: string, b: string): number => {
    const left = versionParts(a)
    const right = versionParts(b)
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const diff = (left[i] ?? 0) - (right[i] ?? 0)
        if (diff !== 0) {
            return Math.sign(diff)
        }
    }
    return 0
}

/**
 * Whether a Metadata Management module can edit an object type. A module that
 * reports no version is used: the menu says the user can open it, and there
 * is nothing to compare.
 */
const canEdit = (module: MenuModule, objectType: MetadataObjectType) =>
    !module.version ||
    compareVersions(
        module.version,
        METADATA_MANAGEMENT_MIN_VERSION[objectType]
    ) >= 0

/**
 * Where an app lives, from its menu name: bundled apps ("dhis-web-...") at
 * the server root, installed apps under api/apps. Used only when the menu
 * reports no usable launch URL.
 */
const appPath = (moduleName: string): string =>
    moduleName.startsWith('dhis-web-')
        ? `${moduleName}/index.html`
        : `api/apps/${moduleName}/index.html`

const resolution = (
    target: LinkTarget,
    module: MenuModule
): LinkResolution => ({
    target,
    launchUrl: module.defaultAction,
    appName: module.displayName,
    fallbackPath: appPath(module.name),
})

/**
 * Choose which app to link to for an object type: Metadata Management when
 * the user can open it and its version can edit that type, otherwise
 * Maintenance. Carry the launch URL the server reported for the app.
 *
 * `undefined` means the menu could not be read (an old version, a failed
 * request). That is not evidence the user lacks Maintenance, so we keep
 * linking there rather than dropping the link.
 */
export const pickLinkTarget = (
    modules: MenuModule[] | undefined,
    objectType: MetadataObjectType
): LinkResolution | null => {
    if (!modules) {
        return { target: 'maintenance' }
    }
    const find = (name: string) =>
        modules.find((module) => module.name === name)

    for (const name of METADATA_MANAGEMENT_MODULES) {
        const found = find(name)
        if (found && canEdit(found, objectType)) {
            return resolution('metadata-management', found)
        }
    }
    const maintenance = find(MAINTENANCE_MODULE)
    if (maintenance) {
        return resolution('maintenance', maintenance)
    }
    return null
}

const isAbsolute = (url: string | undefined): url is string =>
    !!url && /^https?:\/\//.test(url)

/** Build the edit URL for one metadata object in the chosen app. */
export const metadataObjectUrl = ({
    target,
    launchUrl,
    fallbackPath,
    baseUrl,
    objectType,
    id,
}: {
    target: LinkTarget
    launchUrl?: string
    fallbackPath?: string
    baseUrl: string
    objectType: MetadataObjectType
    id: string
}): string => {
    // A relative defaultAction (e.g. "../dhis-web-maintenance/index.html") is
    // resolved against a location this app does not share, so ignore it and
    // build from baseUrl instead.
    const appUrl = isAbsolute(launchUrl)
        ? launchUrl
        : `${trimTrailingSlashes(baseUrl)}/${fallbackPath ?? appPath(DEFAULT_MODULE[target])}`

    const route =
        target === 'metadata-management'
            ? `#/${METADATA_MANAGEMENT_SECTION[objectType]}/${id}`
            : `#/edit/programSection/${objectType}/${id}`

    return new URL(`${appUrl}${route}`, window.location.href).href
}
