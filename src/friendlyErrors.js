/**
 * Friendly error messages utility for StockRoom NJ.
 * Maps raw Firebase/Firestore/API/HTTP errors to clear, calm, user-friendly messages.
 */

// Helper to extract a code from any type of error (string, Error object, FirebaseError, ApiError)
export function getErrorCode(error) {
  if (!error) return null
  if (typeof error === 'string') return error

  // Firebase Error or Custom API Error code
  if (error.code && typeof error.code === 'string') {
    return error.code
  }

  // HTTP status code (from custom ApiError)
  if (error.status) {
    return String(error.status)
  }

  // Parse raw message for Firebase auth/permission pattern or HTTP status
  if (error.message && typeof error.message === 'string') {
    const authMatch = error.message.match(/\((auth\/[a-zA-Z0-9-]+)\)/)
    if (authMatch) return authMatch[1]

    if (error.message.toLowerCase().includes('permission-denied') || error.message.toLowerCase().includes('permission_denied') || error.message.toLowerCase().includes('permission denied')) {
      return 'permission-denied'
    }
    if (error.message.toLowerCase().includes('unauthenticated')) {
      return 'unauthenticated'
    }
    if (error.message.toLowerCase().includes('not-found') || error.message.toLowerCase().includes('not found')) {
      return 'not-found'
    }
    if (error.message.toLowerCase().includes('already-exists') || error.message.toLowerCase().includes('already exists')) {
      return 'already-exists'
    }
    if (error.message.toLowerCase().includes('resource-exhausted') || error.message.toLowerCase().includes('resource exhausted')) {
      return 'resource-exhausted'
    }
    if (error.message.toLowerCase().includes('unavailable')) {
      return 'unavailable'
    }
    if (error.message.toLowerCase().includes('deadline-exceeded') || error.message.toLowerCase().includes('deadline exceeded')) {
      return 'deadline-exceeded'
    }
    if (error.message.toLowerCase().includes('cancelled') || error.message.toLowerCase().includes('canceled')) {
      return 'cancelled'
    }
    if (error.message.toLowerCase().includes('internal error')) {
      return 'internal'
    }
  }

  return null
}

export function isFirebasePermissionError(error) {
  const code = getErrorCode(error)
  return code === 'permission-denied' || code === 'storage/unauthorized'
}

/**
 * Returns a friendly authentication error message.
 * Supports different mappings depending on whether context is 'admin' or 'customer'.
 */
export function getFriendlyAuthError(error, context = 'customer') {
  const code = getErrorCode(error)
  
  if (context === 'admin') {
    // Admin specific Auth overrides
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-email'
    ) {
      return 'We could not sign you in with that staff account. Check your email and password.'
    }
    if (code === 'auth/unauthorized' || code === 'admin-unauthorized') {
      return 'This account does not have dashboard access. Ask an owner to add it as an approved staff account.'
    }
    if (code === 'admin-unapproved') {
      return 'This account is signed in, but it is not approved for the dashboard yet.'
    }
    if (code === 'auth/multi-factor-auth-required' || code === 'mfa-required') {
      return 'Enter the current 6-digit code from your authenticator app.'
    }
    if (code === 'mfa-unsupported') {
      return 'This dashboard only supports authenticator app verification.'
    }
    if (code === 'auth/unverified-email') {
      return 'Verify this email address before setting up two-step authentication.'
    }
    if (code === 'recaptcha-load-failed') {
      return 'The security check could not load. Refresh the page and try again.'
    }
    if (code === 'recaptcha-expired') {
      return 'The security check expired. Complete it again to continue.'
    }
    if (code === 'firebase-config-missing') {
      return 'The dashboard is not fully configured yet. Add the required Firebase settings and refresh.'
    }
  }

  // Customer & Fallback Auth mappings
  switch (code) {
    case 'auth/user-not-found':
      return 'That account does not exist. Create an account instead.'
    case 'auth/invalid-credential':
      return 'We could not sign you in with that email and password. Check your details or reset your password.'
    case 'auth/wrong-password':
      return 'That password is not correct. Try again or reset your password.'
    case 'auth/email-already-in-use':
      return 'An account already exists for this email. Sign in instead.'
    case 'auth/weak-password':
      return 'Choose a stronger password with at least 6 characters.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/missing-password':
      return 'Enter your password to continue.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a little, then try again or reset your password.'
    case 'auth/network-request-failed':
      return 'Network issue. Check your connection and try again.'
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled yet. Enable the Google provider in Firebase Authentication and try again.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Google sign-in. Add it in Firebase Authentication authorized domains.'
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.'
    case 'auth/popup-closed-by-user':
      return 'Sign-in was closed before it finished. Try again.'
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using another sign-in method. Sign in with email first.'
    case 'auth/requires-recent-login':
      return 'For security, sign in again before making this change.'
    case 'auth/multi-factor-auth-required':
      return 'Enter the 6-digit code from your authenticator app.'
    case 'auth/invalid-verification-code':
      return 'That code is invalid or expired. Try the current code from your authenticator app.'
    case 'auth/missing-verification-code':
      return 'Enter the 6-digit code from your authenticator app.'
    case 'auth/code-expired':
      return 'That code expired. Use the newest code from your authenticator app.'
    default:
      return null
  }
}

/**
 * Returns a friendly API/Firestore/Storage error message.
 */
export function getFriendlyApiError(error, context = 'customer') {
  const code = getErrorCode(error)

  // Firestore / Storage Codes
  if (code === 'permission-denied') {
    return context === 'admin'
      ? 'You do not have permission to do that. Make sure your staff account is approved.'
      : 'You do not have permission to do that. Sign in and try again.'
  }

  switch (code) {
    case 'unauthenticated':
    case '401':
      return 'Sign in to continue.'
    case 'not-found':
    case '404':
      return 'We could not find that item. It may have been removed or updated.'
    case 'already-exists':
      return 'That already exists. Try updating the existing one instead.'
    case 'resource-exhausted':
      return 'Too many requests right now. Wait a moment and try again.'
    case 'unavailable':
      return 'The service is temporarily unavailable. Try again in a moment.'
    case 'deadline-exceeded':
      return 'That took too long. Check your connection and try again.'
    case 'cancelled':
      return 'The request was cancelled. Try again.'
    case 'internal':
    case '500':
      return 'Something went wrong on our end. Try again.'
    case 'storage/unauthorized':
    case '403':
      return 'You do not have permission to do that.'
    case 'storage/canceled':
      return 'The upload was cancelled.'
    case 'storage/retry-limit-exceeded':
      return 'The upload took too long. Check your connection and try again.'
    case '400':
      return 'Check the information and try again.'
    case '409':
      return 'This changed while you were working. Refresh and try again.'
    case '429':
      return 'Too many requests. Wait a moment and try again.'
    case '503':
      return 'The service is temporarily unavailable. Try again soon.'
    default:
      return null
  }
}

/**
 * Main function to get a user-friendly error message from any error object.
 */
export function getFriendlyErrorMessage(error, context = 'customer') {
  if (!error) return 'An unknown error occurred.'

  // Log raw error to developer console
  console.error('[Developer Log] Raw Error:', error)

  // 1. Check Auth codes
  const authMsg = getFriendlyAuthError(error, context)
  if (authMsg) return authMsg

  // 2. Check API/Firestore codes
  const apiMsg = getFriendlyApiError(error, context)
  if (apiMsg) return apiMsg

  // 3. String errors
  if (typeof error === 'string') {
    return error
  }

  // 4. Custom API Error with payload message (if it's not a raw technical Firebase/System stack trace)
  if (error.message && typeof error.message === 'string') {
    // Exclude technical errors containing raw stack traces or "Firebase:" prefix
    const isTechnical = 
      error.message.includes('FirebaseError') || 
      error.message.includes('Firebase:') || 
      error.message.includes('auth/') || 
      error.message.includes('uncaught exception') ||
      error.message.includes('TypeError:') ||
      error.message.includes('ReferenceError:')
    
    if (!isTechnical) {
      return error.message
    }
  }

  // 5. Default generic friendly error messages
  return context === 'admin'
    ? 'Something went wrong while processing this dashboard request. Try again.'
    : 'Something went wrong on our end. Try again.'
}

/**
 * Returns a CTA action object if available for the given error code.
 * Used to render custom links/buttons in the UI to help the user recover.
 */
export function getErrorAction(error, context = 'customer') {
  const code = getErrorCode(error)

  if (context === 'customer') {
    if (code === 'auth/user-not-found') {
      return { label: 'Create account', type: 'switch_to_signup' }
    }
    if (code === 'auth/email-already-in-use') {
      return { label: 'Sign in', type: 'switch_to_signin' }
    }
    if (
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/too-many-requests'
    ) {
      return { label: 'Reset password', type: 'switch_to_forgot' }
    }
  }

  return null
}
