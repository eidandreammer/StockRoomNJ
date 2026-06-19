import { useEffect, useState } from 'react'
import SiteShell from './SiteChrome'
import LegalDocumentViewer from './LegalDocumentViewer'
import { loadActiveLegalDocuments } from './legalDocuments'
import './App.css'
import './LegalDocument.css'

export default function LegalApp() {
  const [activeTab, setActiveTab] = useState(() => {
    const docParam = new URLSearchParams(window.location.search).get('doc')
    return docParam === 'PRIVACY_POLICY' ? 'PRIVACY_POLICY' : 'TOS'
  })
  const [documents, setDocuments] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let isActive = true
    async function loadDocs() {
      setStatus('loading')
      setError('')
      try {
        const docs = await loadActiveLegalDocuments()
        if (isActive) {
          setDocuments(docs)
          setStatus('ready')
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || 'Failed to fetch legal documents metadata.')
          setStatus('error')
        }
      }
    }
    loadDocs()
    return () => {
      isActive = false
    }
  }, [])

  // Sync state with browser history or URL change (if user clicks standard links)
  useEffect(() => {
    const handlePopState = () => {
      const docParam = new URLSearchParams(window.location.search).get('doc')
      setActiveTab(docParam === 'PRIVACY_POLICY' ? 'PRIVACY_POLICY' : 'TOS')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleTabChange = (type) => {
    setActiveTab(type)
    // Update URL query param without refreshing page
    const url = new URL(window.location)
    url.searchParams.set('doc', type)
    window.history.pushState({}, '', url)
  }

  // Find the selected document from the loaded documents list
  const selectedDoc = documents.find((doc) => doc.document_type === activeTab)

  // Default fallback URLs in case the backend API has an issue or is loading
  const fallbackUrls = {
    TOS: './Terms of Service - Stock Room NJ.md',
    PRIVACY_POLICY: './Privacy Policy - StockRoomNJ.md',
  }

  const contentUrl = selectedDoc ? selectedDoc.content_url : fallbackUrls[activeTab]
  const versionText = selectedDoc ? `Version ${selectedDoc.version_number}` : '1.0'
  const displayTitle = activeTab === 'TOS' ? 'Terms of Service' : 'Privacy Policy'

  return (
    <SiteShell currentPage="legal">
      <main className="legal-page" id="main-content" style={{ marginTop: '120px' }}>
        <div className="legal-page-header">
          <div className="container">
            <div className="legal-tabs" role="tablist">
              <button
                role="tab"
                type="button"
                aria-selected={activeTab === 'TOS'}
                className={`legal-tab-button ${activeTab === 'TOS' ? 'is-active' : ''}`}
                onClick={() => handleTabChange('TOS')}
              >
                Terms of Service
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={activeTab === 'PRIVACY_POLICY'}
                className={`legal-tab-button ${activeTab === 'PRIVACY_POLICY' ? 'is-active' : ''}`}
                onClick={() => handleTabChange('PRIVACY_POLICY')}
              >
                Privacy Policy
              </button>
            </div>
          </div>
        </div>

        <div className="container">
          {status === 'error' && (
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <p className="checkout-note" style={{ color: 'var(--color-muted)' }}>
                Using local document fallbacks. (Database error: {error})
              </p>
            </div>
          )}

          <LegalDocumentViewer
            contentUrl={contentUrl}
            documentTitle={displayTitle}
            effectiveDate={versionText}
          />
        </div>
      </main>
    </SiteShell>
  )
}
