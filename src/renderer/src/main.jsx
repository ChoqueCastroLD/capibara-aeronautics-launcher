import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import { installMockApi } from './lib/mockApi.js'

installMockApi()
createRoot(document.getElementById('root')).render(<App />)
