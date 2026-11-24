import { useAlert } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import {
    Button,
    Checkbox,
    DataTable,
    DataTableBody,
    DataTableCell,
    DataTableColumnHeader,
    DataTableHead,
    DataTableRow,
    MultiSelectField,
    MultiSelectOption,
    NoticeBox,
} from '@dhis2/ui'
import React, { useMemo, useState } from 'react'
import styles from './UnusedVariablesTab.module.css'
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal'
import { EditInAppLink } from '@/components/EditInAppLink'
import {
    type DeletionOutcome,
    useDeleteVariables,
} from '@/hooks/useDeleteVariables'
import { useMetadataAppLink } from '@/hooks/useMetadataAppLink'
import type { Program, UnusedVariable } from '@/types'

type AlertKind = 'success' | 'warning' | 'critical'

const SEVERITY: AlertKind[] = ['success', 'warning', 'critical']

/**
 * One alert for a delete run. A useAlert hook shows one alert at a time, so
 * the parts are joined, and the alert takes the most severe part's kind.
 */
const outcomeAlert = (
    outcome: DeletionOutcome
): { message: string; kind: AlertKind } | null => {
    const parts = outcomeMessages(outcome)
    if (parts.length === 0) {
        return null
    }
    return {
        message: parts.map((part) => part.message).join(' '),
        kind: parts.reduce<AlertKind>(
            (worst, part) =>
                SEVERITY.indexOf(part.kind) > SEVERITY.indexOf(worst)
                    ? part.kind
                    : worst,
            'success'
        ),
    }
}

/** The parts of the report on one delete run, in the order they are read. */
const outcomeMessages = ({
    deletedIds,
    failedIds,
    nowUsedIds,
    firstError,
}: DeletionOutcome): { message: string; kind: AlertKind }[] => {
    const messages: { message: string; kind: AlertKind }[] = []
    if (deletedIds.length > 0) {
        messages.push({
            kind: 'success',
            message:
                deletedIds.length === 1
                    ? i18n.t('Deleted 1 variable.')
                    : i18n.t('Deleted {{total}} variables.', {
                          total: deletedIds.length,
                      }),
        })
    }
    if (nowUsedIds.length > 0) {
        messages.push({
            kind: 'warning',
            message:
                nowUsedIds.length === 1
                    ? i18n.t(
                          '1 variable was not deleted, because a rule uses it now. Run the validation again.'
                      )
                    : i18n.t(
                          '{{total}} variables were not deleted, because a rule uses them now. Run the validation again.',
                          { total: nowUsedIds.length }
                      ),
        })
    }
    if (failedIds.length > 0 || (deletedIds.length === 0 && firstError)) {
        const summary =
            failedIds.length === 0
                ? i18n.t('Nothing was deleted.')
                : failedIds.length === 1
                  ? i18n.t('Failed to delete 1 variable.')
                  : i18n.t('Failed to delete {{total}} variables.', {
                        total: failedIds.length,
                    })
        messages.push({
            kind: 'critical',
            message: firstError ? `${summary} ${firstError}` : summary,
        })
    }
    return messages
}

export const UnusedVariablesTab = ({
    variables,
    programs,
    canDelete,
    onDeleted,
}: {
    variables: UnusedVariable[]
    programs: Program[]
    /** False when the results are from an earlier run than the last one. */
    canDelete: boolean
    onDeleted: (variableIds: string[]) => void
}) => {
    const [filterProgramIds, setFilterProgramIds] = useState<string[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [showConfirmModal, setShowConfirmModal] = useState(false)
    const {
        target: linkTarget,
        objectUrl,
        isLoading: linkLoading,
    } = useMetadataAppLink()

    const { show: showAlert } = useAlert(
        ({ message }: { message: string; kind: AlertKind }) => message,
        ({ kind }: { message: string; kind: AlertKind }) => ({
            [kind]: true,
        })
    )

    const filteredVariables = useMemo(
        () =>
            filterProgramIds.length === 0
                ? variables
                : variables.filter((variable) =>
                      filterProgramIds.includes(variable.programId)
                  ),
        [variables, filterProgramIds]
    )

    const selectedVariables = useMemo(
        () => variables.filter((v) => selectedIds.has(v.variableId)),
        [variables, selectedIds]
    )

    const { deleteVariables, isDeleting } = useDeleteVariables({
        onSettled: (outcome) => {
            const alert = outcomeAlert(outcome)
            if (alert) {
                showAlert(alert)
            }
            setSelectedIds((current) => {
                const next = new Set(current)
                outcome.deletedIds.forEach((id) => next.delete(id))
                return next
            })
            onDeleted(outcome.deletedIds)
            setShowConfirmModal(false)
        },
    })

    const onFilterChange = ({ selected }: { selected: string[] }) => {
        setFilterProgramIds(selected)
        // Drop selections that are no longer visible under the new filter
        const visibleIds = new Set(
            (selected.length === 0
                ? variables
                : variables.filter((variable) =>
                      selected.includes(variable.programId)
                  )
            ).map((variable) => variable.variableId)
        )
        setSelectedIds(
            (current) =>
                new Set([...current].filter((id) => visibleIds.has(id)))
        )
    }

    const toggleVariable = (variableId: string, checked: boolean) => {
        setSelectedIds((current) => {
            const next = new Set(current)
            if (checked) {
                next.add(variableId)
            } else {
                next.delete(variableId)
            }
            return next
        })
    }

    const allSelected =
        filteredVariables.length > 0 &&
        filteredVariables.every((variable) =>
            selectedIds.has(variable.variableId)
        )
    const someSelected =
        !allSelected &&
        filteredVariables.some((variable) =>
            selectedIds.has(variable.variableId)
        )

    const toggleAll = (checked: boolean) => {
        setSelectedIds((current) => {
            const next = new Set(current)
            filteredVariables.forEach((variable) => {
                if (checked) {
                    next.add(variable.variableId)
                } else {
                    next.delete(variable.variableId)
                }
            })
            return next
        })
    }

    return (
        <div>
            {!canDelete && variables.length > 0 && (
                <div className={styles.notice}>
                    <NoticeBox
                        title={i18n.t('Run the validation again to delete')}
                        dataTest="unused-variables-stale-notice"
                    >
                        {i18n.t(
                            'These results are from an earlier run. Variables can only be deleted from the results of the last run.'
                        )}
                    </NoticeBox>
                </div>
            )}

            <div className={styles.filterRow}>
                <MultiSelectField
                    label={i18n.t('Filter by program')}
                    placeholder={i18n.t('All programs')}
                    selected={filterProgramIds}
                    onChange={onFilterChange}
                    filterable
                    clearable
                    dense
                    inputWidth="400px"
                    dataTest="unused-variables-filter"
                >
                    {programs.map((program) => (
                        <MultiSelectOption
                            key={program.id}
                            value={program.id}
                            label={program.displayName}
                        />
                    ))}
                </MultiSelectField>
            </div>

            <DataTable dataTest="unused-variables-table">
                <DataTableHead>
                    <DataTableRow>
                        <DataTableColumnHeader width="48px">
                            <Checkbox
                                checked={allSelected}
                                indeterminate={someSelected}
                                onChange={({ checked }) => toggleAll(checked)}
                                disabled={
                                    !canDelete || filteredVariables.length === 0
                                }
                                label={
                                    <span className={styles.visuallyHidden}>
                                        {i18n.t(
                                            'Select all unused program rule variables'
                                        )}
                                    </span>
                                }
                                dataTest="select-all-checkbox"
                            />
                        </DataTableColumnHeader>
                        <DataTableColumnHeader>
                            {i18n.t('Program')}
                        </DataTableColumnHeader>
                        <DataTableColumnHeader>
                            {i18n.t('Program rule variable name')}
                        </DataTableColumnHeader>
                        <DataTableColumnHeader>
                            {i18n.t('Program rule variable ID')}
                        </DataTableColumnHeader>
                        <DataTableColumnHeader>
                            {i18n.t('Action')}
                        </DataTableColumnHeader>
                    </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                    {filteredVariables.length === 0 ? (
                        <DataTableRow>
                            <DataTableCell colSpan="5">
                                {i18n.t(
                                    'No unused program rule variables found.'
                                )}
                            </DataTableCell>
                        </DataTableRow>
                    ) : (
                        filteredVariables.map((variable) => (
                            <DataTableRow key={variable.variableId}>
                                <DataTableCell>
                                    <Checkbox
                                        checked={selectedIds.has(
                                            variable.variableId
                                        )}
                                        disabled={!canDelete}
                                        onChange={({ checked }) =>
                                            toggleVariable(
                                                variable.variableId,
                                                checked
                                            )
                                        }
                                        label={
                                            <span
                                                className={
                                                    styles.visuallyHidden
                                                }
                                            >
                                                {i18n.t('Select {{name}}', {
                                                    name: variable.variableName,
                                                    // React escapes it already.
                                                    interpolation: {
                                                        escapeValue: false,
                                                    },
                                                })}
                                            </span>
                                        }
                                        dataTest="variable-checkbox"
                                    />
                                </DataTableCell>
                                <DataTableCell>
                                    {variable.programName}
                                </DataTableCell>
                                <DataTableCell>
                                    {variable.variableName}
                                </DataTableCell>
                                <DataTableCell>
                                    {variable.variableId}
                                </DataTableCell>
                                <DataTableCell>
                                    {!linkLoading && (
                                        <EditInAppLink
                                            target={linkTarget}
                                            url={objectUrl(
                                                'programRuleVariable',
                                                variable.variableId
                                            )}
                                        />
                                    )}
                                </DataTableCell>
                            </DataTableRow>
                        ))
                    )}
                </DataTableBody>
            </DataTable>

            <div className={styles.deleteRow}>
                <Button
                    destructive
                    disabled={
                        !canDelete || selectedIds.size === 0 || isDeleting
                    }
                    onClick={() => setShowConfirmModal(true)}
                    dataTest="delete-selected-button"
                >
                    {i18n.t('Delete selected')}
                </Button>
            </div>

            {showConfirmModal && (
                <DeleteConfirmModal
                    variables={selectedVariables}
                    isDeleting={isDeleting}
                    onCancel={() => setShowConfirmModal(false)}
                    onConfirm={() => deleteVariables(selectedVariables)}
                />
            )}
        </div>
    )
}
