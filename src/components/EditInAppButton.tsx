import i18n from '@dhis2/d2-i18n'
import { Button, IconLaunch16 } from '@dhis2/ui'
import React from 'react'
import type { LinkTarget } from '@/lib/metadataAppLink'

/**
 * Link out to the app where a metadata object can be edited. Renders nothing
 * when the user has neither editing app available, rather than offering a
 * link they cannot follow.
 *
 * The label stays short ("Edit") because the app names are too long for the
 * column; which app it opens is in the tooltip instead.
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

    return (
        <Button
            small
            // The icon and the title flag that this leaves the app for a new tab.
            icon={<IconLaunch16 />}
            title={
                target === 'metadata-management'
                    ? i18n.t('Edit in the Metadata Management app (new tab)')
                    : i18n.t('Edit in the Maintenance app (new tab)')
            }
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        >
            {i18n.t('Edit')}
        </Button>
    )
}
