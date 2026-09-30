/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    type: 'app',
    name: 'tool-pr-validator',
    title: 'Program Rule Validator Tool',
    description:
        'Tool to validate program rules and program rule variables, identifying invalid program rules and unused variables.',
    minDHIS2Version: '2.40',

    entryPoints: {
        app: './src/App.tsx',
    },

    viteConfigExtensions: './viteConfigExtensions.mts',
}

module.exports = config
