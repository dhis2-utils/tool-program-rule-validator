import { useConfig } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import {
    Button,
    DataTable,
    DataTableBody,
    DataTableCell,
    DataTableColumnHeader,
    DataTableHead,
    DataTableRow,
    IconLaunch16,
} from '@dhis2/ui'
import React from 'react'
import type { InvalidExpression } from '@/types'

const maintenanceUrl = (baseUrl: string, ruleId: string): string =>
    new URL(
        `${baseUrl}/dhis-web-maintenance/index.html#/edit/programSection/programRule/${ruleId}`,
        window.location.href
    ).href

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
    const { baseUrl } = useConfig()

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
                                <Button
                                    small
                                    // The icon and the title flag that this
                                    // leaves the app for a new tab.
                                    icon={<IconLaunch16 />}
                                    title={i18n.t(
                                        'Opens the Maintenance app in a new tab'
                                    )}
                                    onClick={() =>
                                        window.open(
                                            maintenanceUrl(baseUrl, row.ruleId),
                                            '_blank',
                                            'noopener,noreferrer'
                                        )
                                    }
                                >
                                    {i18n.t('Open in Maintenance')}
                                </Button>
                            </DataTableCell>
                        </DataTableRow>
                    ))
                )}
            </DataTableBody>
        </DataTable>
    )
}
