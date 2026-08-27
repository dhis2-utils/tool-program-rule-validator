import i18n from '@dhis2/d2-i18n'
import {
    DataTable,
    DataTableBody,
    DataTableCell,
    DataTableColumnHeader,
    DataTableHead,
    DataTableRow,
} from '@dhis2/ui'
import React from 'react'
import { EditInAppButton } from '@/components/EditInAppButton'
import { useMetadataAppLink } from '@/hooks/useMetadataAppLink'
import type { InvalidExpression } from '@/types'

export const InvalidExpressionsTable = ({
    rows,
    messageHeader,
    emptyMessage,
    dataTest,
}: {
    rows: InvalidExpression[]
    messageHeader: string
    emptyMessage: string
    dataTest: string
}) => {
    const { target, objectUrl, isLoading } = useMetadataAppLink()

    return (
        <DataTable dataTest={dataTest}>
            <DataTableHead>
                <DataTableRow>
                    <DataTableColumnHeader>
                        {i18n.t('Program')}
                    </DataTableColumnHeader>
                    <DataTableColumnHeader>
                        {i18n.t('Program rule name')}
                    </DataTableColumnHeader>
                    <DataTableColumnHeader>
                        {i18n.t('Program rule ID')}
                    </DataTableColumnHeader>
                    <DataTableColumnHeader>
                        {messageHeader}
                    </DataTableColumnHeader>
                    <DataTableColumnHeader>
                        {i18n.t('Action')}
                    </DataTableColumnHeader>
                </DataTableRow>
            </DataTableHead>
            <DataTableBody>
                {rows.length === 0 ? (
                    <DataTableRow>
                        <DataTableCell colSpan="5">
                            {emptyMessage}
                        </DataTableCell>
                    </DataTableRow>
                ) : (
                    rows.map((row, index) => (
                        <DataTableRow key={`${row.ruleId}-${index}`}>
                            <DataTableCell>{row.programName}</DataTableCell>
                            <DataTableCell>{row.ruleName}</DataTableCell>
                            <DataTableCell>{row.ruleId}</DataTableCell>
                            <DataTableCell>{row.message}</DataTableCell>
                            <DataTableCell>
                                {!isLoading && (
                                    <EditInAppButton
                                        target={target}
                                        url={objectUrl(
                                            'programRule',
                                            row.ruleId
                                        )}
                                    />
                                )}
                            </DataTableCell>
                        </DataTableRow>
                    ))
                )}
            </DataTableBody>
        </DataTable>
    )
}
