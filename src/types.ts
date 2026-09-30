export type Program = {
    id: string
    displayName: string
}

export type ProgramRuleAction = {
    data?: string
    content?: string
}

export type ProgramRule = {
    id: string
    displayName: string
    condition?: string
    programRuleActions?: ProgramRuleAction[]
}

export type ProgramRuleVariable = {
    id: string
    name: string
    displayName: string
}

export type InvalidExpression = {
    programId: string
    programName: string
    ruleId: string
    ruleName: string
    message: string
}

export type UnusedVariable = {
    programId: string
    programName: string
    variableId: string
    variableName: string
}

export type ValidationResults = {
    validatedPrograms: Program[]
    invalidConditions: InvalidExpression[]
    invalidActions: InvalidExpression[]
    unusedVariables: UnusedVariable[]
    /**
     * Expressions the server could not give a verdict on because the request
     * failed or errored. They are counted rather than listed as invalid, so a
     * transient server problem is never mistaken for a broken rule.
     */
    unvalidatedExpressions: number
}
