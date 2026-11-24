import { useAlert } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import {
    Button,
    ButtonStrip,
    Modal,
    ModalActions,
    ModalContent,
    ModalTitle,
} from '@dhis2/ui'
import React from 'react'
import styles from './DeleteConfirmModal.module.css'
import { useVariableBackup } from '@/hooks/useVariableBackup'
import type { UnusedVariable } from '@/types'

/** How many names the modal lists before summarising the rest. */
const MAX_LISTED = 10

export const DeleteConfirmModal = ({
    variables,
    isDeleting,
    onCancel,
    onConfirm,
}: {
    variables: UnusedVariable[]
    isDeleting: boolean
    onCancel: () => void
    onConfirm: () => void
}) => {
    const { downloadBackup, isDownloading } = useVariableBackup()
    const { show: showError } = useAlert(
        ({ message }: { message: string }) => message,
        { critical: true }
    )
    const count = variables.length
    const listed = variables.slice(0, MAX_LISTED)
    const busy = isDeleting || isDownloading

    const onDownload = () =>
        downloadBackup(variables.map((v) => v.variableId)).catch(
            (error: Error) =>
                showError({
                    message: i18n.t(
                        'Could not download the backup. {{reason}}',
                        {
                            reason: error.message,
                            interpolation: { escapeValue: false },
                        }
                    ),
                })
        )

    return (
        <Modal
            small
            position="middle"
            // Closing while deleting would hide the outcome of the run.
            onClose={busy ? undefined : onCancel}
            dataTest="delete-confirm-modal"
        >
            <ModalTitle>
                {count === 1
                    ? i18n.t('Delete 1 unused variable?')
                    : i18n.t('Delete {{total}} unused variables?', {
                          total: count,
                      })}
            </ModalTitle>
            <ModalContent>
                <ul className={styles.list} data-test="delete-confirm-list">
                    {listed.map((variable) => (
                        <li key={variable.variableId}>
                            {variable.variableName}{' '}
                            <span className={styles.program}>
                                ({variable.programName})
                            </span>
                        </li>
                    ))}
                </ul>
                {count > MAX_LISTED && (
                    <p className={styles.more}>
                        {i18n.t('and {{total}} more', {
                            total: count - MAX_LISTED,
                        })}
                    </p>
                )}
                <p>
                    {i18n.t(
                        'Deleting cannot be undone in this app. To be able to restore the variables, download a backup first. The Import/Export app can import the file.'
                    )}
                </p>
            </ModalContent>
            <ModalActions>
                <ButtonStrip end>
                    <Button secondary onClick={onCancel} disabled={busy}>
                        {i18n.t('Cancel')}
                    </Button>
                    <Button
                        secondary
                        onClick={onDownload}
                        loading={isDownloading}
                        disabled={busy}
                        dataTest="delete-backup-button"
                    >
                        {i18n.t('Download backup')}
                    </Button>
                    <Button
                        destructive
                        onClick={onConfirm}
                        loading={isDeleting}
                        disabled={busy}
                        dataTest="delete-confirm-button"
                    >
                        {i18n.t('Delete')}
                    </Button>
                </ButtonStrip>
            </ModalActions>
        </Modal>
    )
}
