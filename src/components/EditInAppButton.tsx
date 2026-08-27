import i18n from '@dhis2/d2-i18n'
import { Button, IconLaunch16 } from '@dhis2/ui'
import React from 'react'
import type { LinkTarget } from '@/lib/metadataAppLink'

/**
 * Link out to the app where a metadata object can be edited. Renders nothing
 * when the user has neither editing app available, rather than offering a
 * link they cannot follow.
 */
export const EditInAppButton = ({
    url,
    target,
}: {
    url: string | null
    target: LinkTarget | null
}) => {
    if (!url || !target) {
        return null
    }

    const isMetadataApp = target === 'metadata-management'

    return (
        <Button
            small
            // The icon and the title flag that this leaves the app for a new tab.
            icon={<IconLaunch16 />}
            title={
                isMetadataApp
                    ? i18n.t('Opens the Metadata Management app in a new tab')
                    : i18n.t('Opens the Maintenance app in a new tab')
            }
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        >
            {isMetadataApp
                ? i18n.t('Open in Metadata Management')
                : i18n.t('Open in Maintenance')}
        </Button>
    )
}
