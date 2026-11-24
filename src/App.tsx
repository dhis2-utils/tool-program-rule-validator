import { CssReset, CssVariables } from '@dhis2/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ValidatorPage } from '@/components/ValidatorPage'
import './locales'

const queryClient = new QueryClient()

const App = () => (
    <QueryClientProvider client={queryClient}>
        <CssReset />
        <CssVariables theme spacers colors elevations />
        <ValidatorPage />
    </QueryClientProvider>
)

export default App
