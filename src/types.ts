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
}
