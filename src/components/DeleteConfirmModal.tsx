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

export const DeleteConfirmModal = ({
    count,
    isDeleting,
    onCancel,
    onConfirm,
}: {
    count: number
    isDeleting: boolean
    onCancel: () => void
    onConfirm: () => void
}) => (
    <Modal
        small
        position="middle"
        onClose={onCancel}
        dataTest="delete-confirm-modal"
    >
        <ModalTitle>
            {count === 1
                ? i18n.t('Delete 1 unused variable?')
                : i18n.t('Delete {{total}} unused variables?', {
                      total: count,
                  })}
        </ModalTitle>
        <ModalContent>{i18n.t('This action cannot be undone.')}</ModalContent>
        <ModalActions>
            <ButtonStrip end>
                <Button secondary onClick={onCancel} disabled={isDeleting}>
                    {i18n.t('Cancel')}
                </Button>
                <Button
                    destructive
                    onClick={onConfirm}
                    loading={isDeleting}
                    dataTest="delete-confirm-button"
                >
                    {i18n.t('Delete')}
                </Button>
            </ButtonStrip>
        </ModalActions>
    </Modal>
)
