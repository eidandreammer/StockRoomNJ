import { useEffect, useRef } from 'react'
import LegalDocumentViewer from './LegalDocumentViewer'
import './LegalDocument.css'

export default function LegalDocumentModal({ isOpen, onClose, contentUrl, documentTitle, effectiveDate }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal()
        // Prevent body scroll
        document.body.classList.add('is-locked')
      }
    } else {
      if (dialog.open) {
        dialog.close()
        // Restore body scroll
        document.body.classList.remove('is-locked')
      }
    }
  }, [isOpen])

  // Fallback dismiss click handler for browsers without closedby support (like Safari)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (e) => {
      // Prevent browser default and call onClose to sync react state
      e.preventDefault()
      onClose()
    }

    const handleClick = (event) => {
      if (event.target !== dialog) return

      // If closedBy is supported, let the browser handle it
      if ('closedBy' in HTMLDialogElement.prototype) return

      const rect = dialog.getBoundingClientRect()
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      )

      if (!isDialogContent) {
        onClose()
      }
    }

    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('click', handleClick)

    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('click', handleClick)
    }
  }, [onClose])

  if (!isOpen) return null

  return (
    <dialog
      ref={dialogRef}
      className="legal-document-modal"
      closedby="any"
      aria-labelledby="legal-modal-title"
    >
      <div className="legal-modal-header">
        <h2 id="legal-modal-title">{documentTitle}</h2>
        <button
          type="button"
          className="legal-modal-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="legal-modal-content">
        <LegalDocumentViewer
          contentUrl={contentUrl}
          documentTitle={documentTitle}
          effectiveDate={effectiveDate}
        />
      </div>
    </dialog>
  )
}
