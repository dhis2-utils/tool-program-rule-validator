import {
    compareVersions,
    metadataObjectUrl,
    pickLinkTarget,
} from './metadataAppLink'
import type { MenuModule } from './metadataAppLink'

const mod = (name: string, defaultAction?: string): MenuModule => ({
    name,
    ...(defaultAction ? { defaultAction } : {}),
})

// The two shapes the Metadata Management app actually takes, captured live.
const BUNDLED = mod(
    'dhis-web-metadata-management',
    'https://play.dhis2.org/dev/dhis-web-metadata-management/index.html'
)
const APP_HUB = mod(
    'metadata-management',
    'https://play.dhis2.org/dev/api/apps/metadata-management/index.html'
)
const MAINTENANCE = mod(
    'dhis-web-maintenance',
    'https://play.dhis2.org/dev/dhis-web-maintenance/index.html'
)

describe('pickLinkTarget', () => {
    it('recognises the bundled Metadata Management app (2.43+)', () => {
        // Bundled installs appear in the menu as dhis-web-metadata-management.
        expect(
            pickLinkTarget([MAINTENANCE, BUNDLED], 'programRule')
        ).toMatchObject({
            target: 'metadata-management',
            launchUrl: BUNDLED.defaultAction,
        })
    })

    it('recognises an App Hub install of Metadata Management', () => {
        expect(
            pickLinkTarget([MAINTENANCE, APP_HUB], 'programRule')
        ).toMatchObject({
            target: 'metadata-management',
            launchUrl: APP_HUB.defaultAction,
        })
    })

    it('falls back to Maintenance when only that app is available', () => {
        expect(
            pickLinkTarget(
                [mod('dhis-web-dashboard'), MAINTENANCE],
                'programRule'
            )
        ).toMatchObject({
            target: 'maintenance',
            launchUrl: MAINTENANCE.defaultAction,
        })
    })

    it('returns null when the user has neither app', () => {
        expect(
            pickLinkTarget([mod('dhis-web-dashboard')], 'programRule')
        ).toBeNull()
    })

    it('returns null for an empty menu', () => {
        expect(pickLinkTarget([], 'programRule')).toBeNull()
    })

    it('falls back to Maintenance when the menu could not be read', () => {
        // A failed or unavailable apps/menu must not hide the link entirely.
        expect(pickLinkTarget(undefined, 'programRule')).toMatchObject({
            target: 'maintenance',
        })
    })

    it('does not mistake dhis-web-maintenance-mobile for Maintenance', () => {
        expect(
            pickLinkTarget([mod('dhis-web-maintenance-mobile')], 'programRule')
        ).toBeNull()
    })
})

describe('pickLinkTarget by Metadata Management version', () => {
    const withVersion = (module: MenuModule, version: string): MenuModule => ({
        ...module,
        version,
    })

    it('links to Metadata Management from the version with the edit screen', () => {
        const modules = [MAINTENANCE, withVersion(APP_HUB, '0.135.0')]
        expect(pickLinkTarget(modules, 'programRule')?.target).toBe(
            'metadata-management'
        )
        expect(pickLinkTarget(modules, 'programRuleVariable')?.target).toBe(
            'metadata-management'
        )
    })

    it('links program rules to Maintenance below 0.135.0', () => {
        const modules = [MAINTENANCE, withVersion(APP_HUB, '0.134.9')]
        expect(pickLinkTarget(modules, 'programRule')).toMatchObject({
            target: 'maintenance',
            launchUrl: MAINTENANCE.defaultAction,
        })
        // Program rule variables already have their screen in that version.
        expect(pickLinkTarget(modules, 'programRuleVariable')?.target).toBe(
            'metadata-management'
        )
    })

    it('links both types to Maintenance below 0.119.0', () => {
        const modules = [withVersion(BUNDLED, '0.118.0'), MAINTENANCE]
        expect(pickLinkTarget(modules, 'programRule')?.target).toBe(
            'maintenance'
        )
        expect(pickLinkTarget(modules, 'programRuleVariable')?.target).toBe(
            'maintenance'
        )
    })

    it('gives no link when Metadata Management is too old and Maintenance is missing', () => {
        expect(
            pickLinkTarget([withVersion(APP_HUB, '0.100.0')], 'programRule')
        ).toBeNull()
    })

    it('uses Metadata Management when it reports no version', () => {
        expect(
            pickLinkTarget([MAINTENANCE, APP_HUB], 'programRule')?.target
        ).toBe('metadata-management')
    })
})

describe('pickLinkTarget, app names and paths', () => {
    it('recognises Metadata Management under its old key, maintenance-preview', () => {
        const preview: MenuModule = {
            name: 'maintenance-preview',
            displayName: 'Maintenance (Preview)',
            version: '0.140.0',
            defaultAction: '../api/apps/maintenance-preview/index.html',
        }
        expect(pickLinkTarget([MAINTENANCE, preview], 'programRule')).toEqual({
            target: 'metadata-management',
            launchUrl: preview.defaultAction,
            appName: 'Maintenance (Preview)',
            fallbackPath: 'api/apps/maintenance-preview/index.html',
        })
    })

    it('prefers the current key over the old one', () => {
        const preview = mod('maintenance-preview')
        expect(
            pickLinkTarget([preview, APP_HUB], 'programRule')?.launchUrl
        ).toBe(APP_HUB.defaultAction)
    })

    it('places bundled apps at the root and installed apps under api/apps', () => {
        expect(pickLinkTarget([BUNDLED], 'programRule')?.fallbackPath).toBe(
            'dhis-web-metadata-management/index.html'
        )
        expect(pickLinkTarget([APP_HUB], 'programRule')?.fallbackPath).toBe(
            'api/apps/metadata-management/index.html'
        )
        expect(pickLinkTarget([MAINTENANCE], 'programRule')?.fallbackPath).toBe(
            'dhis-web-maintenance/index.html'
        )
    })
})

describe('metadataObjectUrl with a relative launch URL', () => {
    it('builds the app path from the fallback path', () => {
        expect(
            metadataObjectUrl({
                target: 'metadata-management',
                launchUrl: '../api/apps/maintenance-preview/index.html',
                fallbackPath: 'api/apps/maintenance-preview/index.html',
                baseUrl: 'https://dhis2.example.org/hmis',
                objectType: 'programRuleVariable',
                id: 'abcdefghijk',
            })
        ).toBe(
            'https://dhis2.example.org/hmis/api/apps/maintenance-preview/index.html#/programRuleVariables/abcdefghijk'
        )
    })
})

describe('compareVersions', () => {
    it.each([
        ['0.135.0', '0.135.0', 0],
        ['0.179.0', '0.135.0', 1],
        ['0.99.0', '0.135.0', -1],
        ['1.0', '0.135.0', 1],
        ['0.135', '0.135.0', 0],
        ['0.135.0-beta.1', '0.135.0', 0],
    ])('compares %s with %s as %d', (a, b, expected) => {
        expect(compareVersions(a, b)).toBe(expected)
    })
})

describe('metadataObjectUrl', () => {
    const baseUrl = 'https://play.dhis2.org/dev'

    it('uses the bundled app launch URL the server reports', () => {
        expect(
            metadataObjectUrl({
                target: 'metadata-management',
                launchUrl: BUNDLED.defaultAction,
                baseUrl,
                objectType: 'programRule',
                id: 'NAgjOfWMXg6',
            })
        ).toBe(
            'https://play.dhis2.org/dev/dhis-web-metadata-management/index.html#/programRules/NAgjOfWMXg6'
        )
    })

    it('uses the App Hub launch URL when that is what the server reports', () => {
        expect(
            metadataObjectUrl({
                target: 'metadata-management',
                launchUrl: APP_HUB.defaultAction,
                baseUrl,
                objectType: 'programRuleVariable',
                id: 'gFrr5jqSLGJ',
            })
        ).toBe(
            'https://play.dhis2.org/dev/api/apps/metadata-management/index.html#/programRuleVariables/gFrr5jqSLGJ'
        )
    })

    it('uses the reported launch URL for Maintenance too', () => {
        expect(
            metadataObjectUrl({
                target: 'maintenance',
                launchUrl: MAINTENANCE.defaultAction,
                baseUrl,
                objectType: 'programRule',
                id: 'NAgjOfWMXg6',
            })
        ).toBe(
            'https://play.dhis2.org/dev/dhis-web-maintenance/index.html#/edit/programSection/programRule/NAgjOfWMXg6'
        )
    })

    it('falls back to a baseUrl path when no launch URL is reported', () => {
        expect(
            metadataObjectUrl({
                target: 'maintenance',
                baseUrl,
                objectType: 'programRule',
                id: 'NAgjOfWMXg6',
            })
        ).toBe(
            'https://play.dhis2.org/dev/dhis-web-maintenance/index.html#/edit/programSection/programRule/NAgjOfWMXg6'
        )
    })

    it('ignores a relative launch URL, which cannot be resolved reliably', () => {
        // Older servers report e.g. "../dhis-web-maintenance/index.html",
        // relative to a location this app does not share.
        expect(
            metadataObjectUrl({
                target: 'maintenance',
                launchUrl: '../dhis-web-maintenance/index.html',
                baseUrl,
                objectType: 'programRule',
                id: 'abc',
            })
        ).toBe(
            'https://play.dhis2.org/dev/dhis-web-maintenance/index.html#/edit/programSection/programRule/abc'
        )
    })

    it('uses the fallback path when there is no launch URL', () => {
        expect(
            metadataObjectUrl({
                target: 'metadata-management',
                fallbackPath: 'api/apps/metadata-management/index.html',
                baseUrl,
                objectType: 'programRule',
                id: 'abc',
            })
        ).toBe(
            'https://play.dhis2.org/dev/api/apps/metadata-management/index.html#/programRules/abc'
        )
    })

    it('tolerates a trailing slash on the base URL', () => {
        expect(
            metadataObjectUrl({
                target: 'metadata-management',
                fallbackPath: 'api/apps/metadata-management/index.html',
                baseUrl: 'https://play.dhis2.org/dev/',
                objectType: 'programRule',
                id: 'abc',
            })
        ).toBe(
            'https://play.dhis2.org/dev/api/apps/metadata-management/index.html#/programRules/abc'
        )
    })
})
