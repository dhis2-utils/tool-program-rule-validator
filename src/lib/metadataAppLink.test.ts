import {
    metadataObjectUrl,
    pickLinkTarget,
    type MenuModule,
} from './metadataAppLink'

const menu = (...names: string[]): MenuModule[] =>
    names.map((name) => ({ name }))

describe('pickLinkTarget', () => {
    it('prefers Metadata Management when the user has both apps', () => {
        expect(
            pickLinkTarget(menu('dhis-web-maintenance', 'metadata-management'))
        ).toBe('metadata-management')
    })

    it('falls back to Maintenance when only that app is available', () => {
        expect(
            pickLinkTarget(menu('dhis-web-dashboard', 'dhis-web-maintenance'))
        ).toBe('maintenance')
    })

    it('picks Metadata Management when Maintenance is absent', () => {
        expect(pickLinkTarget(menu('metadata-management'))).toBe(
            'metadata-management'
        )
    })

    it('returns null when the user has neither app', () => {
        expect(pickLinkTarget(menu('dhis-web-dashboard'))).toBeNull()
    })

    it('returns null for an empty menu', () => {
        expect(pickLinkTarget([])).toBeNull()
    })

    it('falls back to Maintenance when the menu could not be read', () => {
        // A failed or unavailable apps/menu must not hide the link entirely.
        expect(pickLinkTarget(undefined)).toBe('maintenance')
    })

    it('does not mistake dhis-web-maintenance-mobile for Maintenance', () => {
        expect(pickLinkTarget(menu('dhis-web-maintenance-mobile'))).toBeNull()
    })
})

describe('metadataObjectUrl', () => {
    const base = 'https://play.dhis2.org/dev'

    it('links a program rule into Metadata Management', () => {
        // Verified live on 2.41: this route opens "Edit: <rule name>".
        expect(
            metadataObjectUrl({
                target: 'metadata-management',
                baseUrl: base,
                objectType: 'programRule',
                id: 'NAgjOfWMXg6',
            })
        ).toBe(
            'https://play.dhis2.org/dev/api/apps/metadata-management/index.html#/programRules/NAgjOfWMXg6'
        )
    })

    it('links a program rule variable into Metadata Management', () => {
        expect(
            metadataObjectUrl({
                target: 'metadata-management',
                baseUrl: base,
                objectType: 'programRuleVariable',
                id: 'gFrr5jqSLGJ',
            })
        ).toBe(
            'https://play.dhis2.org/dev/api/apps/metadata-management/index.html#/programRuleVariables/gFrr5jqSLGJ'
        )
    })

    it('links a program rule into Maintenance', () => {
        expect(
            metadataObjectUrl({
                target: 'maintenance',
                baseUrl: base,
                objectType: 'programRule',
                id: 'NAgjOfWMXg6',
            })
        ).toBe(
            'https://play.dhis2.org/dev/dhis-web-maintenance/index.html#/edit/programSection/programRule/NAgjOfWMXg6'
        )
    })

    it('links a program rule variable into Maintenance', () => {
        expect(
            metadataObjectUrl({
                target: 'maintenance',
                baseUrl: base,
                objectType: 'programRuleVariable',
                id: 'gFrr5jqSLGJ',
            })
        ).toBe(
            'https://play.dhis2.org/dev/dhis-web-maintenance/index.html#/edit/programSection/programRuleVariable/gFrr5jqSLGJ'
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
