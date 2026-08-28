import {
    metadataObjectUrl,
    pickLinkTarget,
    type MenuModule,
} from './metadataAppLink'

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
    it('recognises the bundled Metadata Management app (2.42+)', () => {
        // Bundled installs appear in the menu as dhis-web-metadata-management.
        expect(pickLinkTarget([MAINTENANCE, BUNDLED])).toEqual({
            target: 'metadata-management',
            launchUrl: BUNDLED.defaultAction,
        })
    })

    it('recognises an App Hub install of Metadata Management', () => {
        expect(pickLinkTarget([MAINTENANCE, APP_HUB])).toEqual({
            target: 'metadata-management',
            launchUrl: APP_HUB.defaultAction,
        })
    })

    it('falls back to Maintenance when only that app is available', () => {
        expect(
            pickLinkTarget([mod('dhis-web-dashboard'), MAINTENANCE])
        ).toEqual({
            target: 'maintenance',
            launchUrl: MAINTENANCE.defaultAction,
        })
    })

    it('returns null when the user has neither app', () => {
        expect(pickLinkTarget([mod('dhis-web-dashboard')])).toBeNull()
    })

    it('returns null for an empty menu', () => {
        expect(pickLinkTarget([])).toBeNull()
    })

    it('falls back to Maintenance when the menu could not be read', () => {
        // A failed or unavailable apps/menu must not hide the link entirely.
        expect(pickLinkTarget(undefined)).toEqual({ target: 'maintenance' })
    })

    it('does not mistake dhis-web-maintenance-mobile for Maintenance', () => {
        expect(pickLinkTarget([mod('dhis-web-maintenance-mobile')])).toBeNull()
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

    it('falls back to the App Hub path for Metadata Management', () => {
        expect(
            metadataObjectUrl({
                target: 'metadata-management',
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
                baseUrl: 'https://play.dhis2.org/dev/',
                objectType: 'programRule',
                id: 'abc',
            })
        ).toBe(
            'https://play.dhis2.org/dev/api/apps/metadata-management/index.html#/programRules/abc'
        )
    })
})
