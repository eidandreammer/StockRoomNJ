import { getFriendlyErrorMessage, getErrorAction } from './friendlyErrors'

export default function FriendlyAlert({
  error,
  context = 'customer',
  onAction,
  className = '',
  style = {}
}) {
  if (!error) return null

  const message = getFriendlyErrorMessage(error, context)
  const action = getErrorAction(error, context)

  return (
    <div
      className={`friendly-alert is-error ${context}-theme ${className}`}
      role="alert"
      aria-live="assertive"
      style={style}
    >
      <div className="friendly-alert-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className="friendly-alert-content">
        <span className="friendly-alert-message">{message}</span>
        {action && onAction && (
          <button
            type="button"
            className="friendly-alert-action"
            onClick={() => onAction(action)}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}
