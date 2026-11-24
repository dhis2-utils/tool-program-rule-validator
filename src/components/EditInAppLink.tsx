import i18n from '@dhis2/d2-i18n'
import { IconLaunch16 } from '@dhis2/ui'
import React from 'react'
import styles from './EditInAppLink.module.css'
import type { LinkTarget } from '@/lib/metadataAppLink'

/**
 * Link out to the app where a metadata object can be edited. Renders nothing
 * when the user has neither editing app available, rather than offering a
 * link they cannot follow.
 *
 * A real link, styled as a small button, so it can be middle-clicked, copied
 * and opened from the context menu. The label stays short ("Edit") because
 * the app names are too long for the column; the title names the app.
 */
export const EditInAppLink = ({
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
        <a
            className={styles.link}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={
                target === 'metadata-management'
                    ? i18n.t('Edit in the Metadata Management app (new tab)')
                    : i18n.t('Edit in the Maintenance app (new tab)')
            }
            data-test="edit-in-app-link"
        >
            <IconLaunch16 />
            {i18n.t('Edit')}
        </a>
    )
}
