/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    type: 'app',
    name: 'tool-program-rule-validator',
    title: 'Program Rule Validator Tool',
    description:
        'Finds invalid program rule expressions and unused program rule variables, and deletes the unused variables.',
    minDHIS2Version: '2.40',

    entryPoints: {
        app: './src/App.tsx',
    },

    viteConfigExtensions: './viteConfigExtensions.mts',
}

module.exports = config
