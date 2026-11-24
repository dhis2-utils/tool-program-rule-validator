/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    type: 'app',
    name: 'tool-program-rule-validator',
    title: 'Program Rule Validator Tool',
    description:
        'Validates program rules and program rule variables, and finds invalid expressions and unused variables.',
    author: { name: 'HISP Centre - University of Oslo' },
    minDHIS2Version: '2.40',

    entryPoints: {
        app: './src/App.tsx',
    },

    viteConfigExtensions: './viteConfigExtensions.mts',
}

module.exports = config
