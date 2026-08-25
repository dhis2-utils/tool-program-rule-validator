import i18n from '@dhis2/d2-i18n'
import {
    Button,
    ButtonStrip,
    CircularLoader,
    LinearLoader,
    MultiSelectField,
    MultiSelectOption,
    NoticeBox,
    Tab,
    TabBar,
} from '@dhis2/ui'
import React, { useState } from 'react'
import styles from './ValidatorPage.module.css'
import { InvalidExpressionsTable } from '@/components/InvalidExpressionsTable'
import { UnusedVariablesTab } from '@/components/UnusedVariablesTab'
import { usePrograms } from '@/hooks/usePrograms'
import { useValidation } from '@/hooks/useValidation'

type TabKey = 'conditions' | 'actions' | 'unused'

export const ValidatorPage = () => {
    const { programs, isLoading, error } = usePrograms()
    const { state, results, start, cancel, removeUnusedVariables } =
        useValidation()
    const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([])
    const [activeTab, setActiveTab] = useState<TabKey>('conditions')

    const isRunning = state.status === 'running'
    // Results from the last completed run stay on screen when a later run is
    // cancelled or fails; they are hidden while a run is in progress so they
    // can't be mistaken for its output.
    const showResults = results !== null && !isRunning
    const resultsAreStale = showResults && state.status !== 'done'

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <CircularLoader />
            </div>
        )
    }

    if (error) {
        return (
            <div className={styles.container}>
                <NoticeBox error title={i18n.t('Error loading programs')}>
                    {error.message ||
                        i18n.t(
                            'Could not load the program list from the server.'
                        )}
                </NoticeBox>
            </div>
        )
    }

    const allPrograms = programs ?? []
    const validateSelected = () =>
        start(
            allPrograms.filter((program) =>
                selectedProgramIds.includes(program.id)
            )
        )
    const validateAll = () => start(allPrograms)

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>{i18n.t('Program Rule Validator')}</h1>
            <p className={styles.description}>
                {i18n.t(
                    'Validate program rules, identifying invalid program rule expressions and unused program rule variables.'
                )}
            </p>

            <div className={styles.controls}>
                <div className={styles.programSelect}>
                    <MultiSelectField
                        label={i18n.t('Programs to validate')}
                        placeholder={i18n.t('Select programs')}
                        selected={selectedProgramIds}
                        onChange={({ selected }) =>
                            setSelectedProgramIds(selected)
                        }
                        disabled={isRunning}
                        filterable
                        clearable
                        inputWidth="400px"
                        dataTest="program-select"
                    >
                        {allPrograms.map((program) => (
                            <MultiSelectOption
                                key={program.id}
                                value={program.id}
                                label={program.displayName}
                            />
                        ))}
                    </MultiSelectField>
                </div>
                <ButtonStrip>
                    <Button
                        primary
                        disabled={selectedProgramIds.length === 0 || isRunning}
                        onClick={validateSelected}
                        dataTest="validate-selected-button"
                    >
                        {i18n.t('Validate selected')}
                    </Button>
                    <Button
                        disabled={isRunning || allPrograms.length === 0}
                        onClick={validateAll}
                        dataTest="validate-all-button"
                    >
                        {i18n.t('Validate all')}
                    </Button>
                    {isRunning && (
                        <Button onClick={cancel} dataTest="cancel-button">
                            {i18n.t('Cancel')}
                        </Button>
                    )}
                </ButtonStrip>
            </div>

            {isRunning && (
                <div
                    className={styles.progress}
                    data-test="validation-progress"
                >
                    <LinearLoader
                        amount={state.status === 'running' ? state.progress : 0}
                        width="100%"
                    />
                </div>
            )}

            {state.status === 'cancelled' && (
                <div className={styles.notice}>
                    <NoticeBox title={i18n.t('Validation cancelled')}>
                        {i18n.t(
                            'The validation run was cancelled before it completed.'
                        )}
                        {resultsAreStale &&
                            ` ${i18n.t('The results below are from the last completed run.')}`}
                    </NoticeBox>
                </div>
            )}

            {state.status === 'error' && (
                <div className={styles.notice}>
                    <NoticeBox error title={i18n.t('Validation failed')}>
                        {state.message}
                        {resultsAreStale &&
                            ` ${i18n.t('The results below are from the last completed run.')}`}
                    </NoticeBox>
                </div>
            )}

            {showResults && results.unvalidatedExpressions > 0 && (
                <div className={styles.notice}>
                    <NoticeBox
                        warning
                        title={i18n.t(
                            'Some expressions could not be validated'
                        )}
                        dataTest="unvalidated-expressions-warning"
                    >
                        {i18n.t(
                            '{{total}} expression(s) could not be checked because the server did not answer. They are not listed as invalid — run the validation again to check them.',
                            { total: results.unvalidatedExpressions }
                        )}
                    </NoticeBox>
                </div>
            )}

            {showResults && (
                <div data-test="validation-results">
                    <TabBar>
                        <Tab
                            selected={activeTab === 'conditions'}
                            onClick={() => setActiveTab('conditions')}
                            dataTest="tab-invalid-conditions"
                        >
                            {i18n.t('Invalid conditions ({{total}})', {
                                total: results.invalidConditions.length,
                            })}
                        </Tab>
                        <Tab
                            selected={activeTab === 'actions'}
                            onClick={() => setActiveTab('actions')}
                            dataTest="tab-invalid-actions"
                        >
                            {i18n.t('Invalid actions ({{total}})', {
                                total: results.invalidActions.length,
                            })}
                        </Tab>
                        <Tab
                            selected={activeTab === 'unused'}
                            onClick={() => setActiveTab('unused')}
                            dataTest="tab-unused-variables"
                        >
                            {i18n.t('Unused program variables ({{total}})', {
                                total: results.unusedVariables.length,
                            })}
                        </Tab>
                    </TabBar>
                    <div className={styles.tabContent}>
                        {activeTab === 'conditions' && (
                            <InvalidExpressionsTable
                                rows={results.invalidConditions}
                                messageHeader={i18n.t(
                                    'Invalid condition expression'
                                )}
                                emptyMessage={i18n.t(
                                    'No invalid program rule conditions found.'
                                )}
                                dataTest="invalid-conditions-table"
                            />
                        )}
                        {activeTab === 'actions' && (
                            <InvalidExpressionsTable
                                rows={results.invalidActions}
                                messageHeader={i18n.t(
                                    'Invalid action expression'
                                )}
                                emptyMessage={i18n.t(
                                    'No invalid program rule action expressions found.'
                                )}
                                dataTest="invalid-actions-table"
                            />
                        )}
                        {activeTab === 'unused' && (
                            <UnusedVariablesTab
                                variables={results.unusedVariables}
                                programs={results.validatedPrograms}
                                onDeleted={removeUnusedVariables}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
