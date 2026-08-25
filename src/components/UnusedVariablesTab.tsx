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
} from '@dhis2/ui'
import React, { useMemo, useState } from 'react'
import styles from './UnusedVariablesTab.module.css'
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal'
import { useDeleteVariables } from '@/hooks/useDeleteVariables'
import type { Program, UnusedVariable } from '@/types'

export const UnusedVariablesTab = ({
    variables,
    programs,
    onDeleted,
}: {
    variables: UnusedVariable[]
    programs: Program[]
    onDeleted: (variableIds: string[]) => void
}) => {
    const [filterProgramIds, setFilterProgramIds] = useState<string[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [showConfirmModal, setShowConfirmModal] = useState(false)

    const { show: showAlert } = useAlert(
        ({ message }) => message,
        ({ isError }) => (isError ? { critical: true } : { success: true })
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

    const { deleteVariables, isDeleting } = useDeleteVariables({
        onSettled: ({ deletedIds, failedIds }) => {
            if (deletedIds.length > 0) {
                showAlert({
                    message:
                        deletedIds.length === 1
                            ? i18n.t('Deleted 1 variable.')
                            : i18n.t('Deleted {{total}} variables.', {
                                  total: deletedIds.length,
                              }),
                    isError: false,
                })
            }
            if (failedIds.length > 0) {
                showAlert({
                    message:
                        failedIds.length === 1
                            ? i18n.t('Failed to delete 1 variable.')
                            : i18n.t('Failed to delete {{total}} variables.', {
                                  total: failedIds.length,
                              }),
                    isError: true,
                })
            }
            setSelectedIds((current) => {
                const next = new Set(current)
                deletedIds.forEach((id) => next.delete(id))
                return next
            })
            onDeleted(deletedIds)
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
                                disabled={filteredVariables.length === 0}
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
                    </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                    {filteredVariables.length === 0 ? (
                        <DataTableRow>
                            <DataTableCell colSpan="4">
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
                            </DataTableRow>
                        ))
                    )}
                </DataTableBody>
            </DataTable>

            <div className={styles.deleteRow}>
                <Button
                    destructive
                    disabled={selectedIds.size === 0 || isDeleting}
                    onClick={() => setShowConfirmModal(true)}
                    dataTest="delete-selected-button"
                >
                    {i18n.t('Delete selected')}
                </Button>
            </div>

            {showConfirmModal && (
                <DeleteConfirmModal
                    count={selectedIds.size}
                    isDeleting={isDeleting}
                    onCancel={() => setShowConfirmModal(false)}
                    onConfirm={() => deleteVariables([...selectedIds])}
                />
            )}
        </div>
    )
}
