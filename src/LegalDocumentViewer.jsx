import { useEffect, useState, useMemo } from 'react'
import './LegalDocument.css'
import { getFriendlyErrorMessage } from './friendlyErrors'

function parseMarkdownToJsx(text) {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const elements = [];
  let currentList = [];
  let listKey = 0;

  const parseInline = (inlineText, keyPrefix) => {
    const cleanText = inlineText.replace(/\\/g, ''); // strip backslashes
    const parts = cleanText.split('**');
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={`${keyPrefix}-bold-${index}`}>{part}</strong>;
      }
      return part;
    });
  };

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`}>
          {currentList.map((item, index) => (
            <li key={`li-${index}`}>{parseInline(item, `li-${index}`)}</li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      flushList();
      continue;
    }

    // List items
    const listMatch = line.match(/^[*-]\s+(.*)$/);
    if (listMatch) {
      currentList.push(listMatch[1]);
      continue;
    }

    flushList();

    // Headers
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const content = hMatch[2];
      const inlineParsed = parseInline(content, `h${level}-${i}`);
      const textOnly = content.replace(/\*\*/g, '').replace(/\\/g, '').trim();
      const id = textOnly.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      
      const HTag = `h${level}`;
      elements.push(
        <HTag id={id} key={`h-${i}`}>
          {inlineParsed}
        </HTag>
      );
      continue;
    }

    // Disclaimer check
    if (line.startsWith('*Disclaimer:') && line.endsWith('*')) {
      const text = line.substring(1, line.length - 1);
      elements.push(
        <p className="disclaimer-text" key={`disclaimer-${i}`}>
          {parseInline(text, `disclaimer-${i}`)}
        </p>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`}>
        {parseInline(line, `p-${i}`)}
      </p>
    );
  }

  flushList();
  return elements;
}

export default function LegalDocumentViewer({ contentUrl, documentTitle, effectiveDate }) {
  const [markdown, setMarkdown] = useState('')
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState('')

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Reset fetch state when the document URL changes. */
    if (!contentUrl) {
      setStatus('error')
      setError('No content URL provided.')
      return
    }

    let isActive = true
    setStatus('loading')
    setError('')
    /* eslint-enable react-hooks/set-state-in-effect */

    // Fetch the markdown file
    fetch(contentUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load document (HTTP ${response.status})`)
        }
        return response.text()
      })
      .then((text) => {
        if (isActive) {
          setMarkdown(text)
          setStatus('ready')
        }
      })
      .catch((err) => {
        if (isActive) {
          setError(getFriendlyErrorMessage(err, 'customer'))
          setStatus('error')
        }
      })

    return () => {
      isActive = false
    }
  }, [contentUrl])

  // Parse markdown to elements
  const parsedElements = useMemo(() => {
    return parseMarkdownToJsx(markdown)
  }, [markdown])

  // Extract sections (h3 headers) for Table of Contents
  const sections = useMemo(() => {
    if (!markdown) return []
    const lines = markdown.replace(/\r\n/g, '\n').split('\n')
    const extracted = []
    
    for (const line of lines) {
      const match = line.trim().match(/^###\s+(.*)$/)
      if (match) {
        const textOnly = match[1].replace(/\*\*/g, '').replace(/\\/g, '').trim()
        const id = textOnly.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        extracted.push({ id, label: textOnly })
      }
    }
    return extracted
  }, [markdown])

  // Set up IntersectionObserver to update active section in sidebar on scroll
  useEffect(() => {
    if (status !== 'ready' || sections.length === 0) return

    const observerOptions = {
      root: null,
      rootMargin: '-10% 0px -80% 0px',
      threshold: 0
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id)
        }
      })
    }, observerOptions)

    sections.forEach((section) => {
      const el = document.getElementById(section.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [status, sections])

  const handlePrint = () => {
    window.print()
  }

  const scrollToSection = (id) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSection(id)
    }
  }

  if (status === 'loading') {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-muted)' }}>
        <p>Loading document content...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'red' }}>
        <p>{error || 'Could not load document.'}</p>
      </div>
    )
  }

  return (
    <div className="legal-viewer-container">
      {sections.length > 0 && (
        <aside className="legal-sidebar" aria-label="Table of Contents">
          <h3>Sections</h3>
          <ul className="legal-toc-list">
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={`legal-toc-link ${activeSection === section.id ? 'is-active' : ''}`}
                  onClick={() => scrollToSection(section.id)}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <article className="legal-document-sheet">
        <div className="legal-doc-topbar">
          <div className="legal-doc-meta">
            <h1>{documentTitle}</h1>
            {effectiveDate && (
              <span className="legal-doc-effective">
                Effective Date: {effectiveDate}
              </span>
            )}
          </div>
          <div className="legal-doc-actions">
            <button type="button" className="legal-action-button" onClick={handlePrint} title="Print Document">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print
            </button>
          </div>
        </div>

        <div className="legal-content-body">
          {parsedElements}
        </div>
      </article>
    </div>
  )
}
