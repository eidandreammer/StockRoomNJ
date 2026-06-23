import { useEffect, useState } from 'react'
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getMultiFactorResolver,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import { apiRequest } from './api'
import { Icon } from './SiteChrome'
import FriendlyAlert from './FriendlyAlert'

const states = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]

export default function AccountDrawer({ isOpen, onClose }) {
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('signin') // 'signin', 'signup', 'forgot'
  const [activeTab, setActiveTab] = useState('profile') // 'profile', 'address', 'notifications'
  const [mfaResolver, setMfaResolver] = useState(null)
  const [mfaCode, setMfaCode] = useState('')

  // Auth Inputs
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [nameInput, setNameInput] = useState('')

  // Profile Inputs
  const [profileName, setProfileName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')

  // Address Inputs
  const [shippingStreet, setShippingStreet] = useState('')
  const [shippingCity, setShippingCity] = useState('')
  const [shippingState, setShippingState] = useState('')
  const [shippingZip, setShippingZip] = useState('')
  const [sameAsShipping, setSameAsShipping] = useState(true)
  const [billingStreet, setBillingStreet] = useState('')
  const [billingCity, setBillingCity] = useState('')
  const [billingState, setBillingState] = useState('')
  const [billingZip, setBillingZip] = useState('')

  // Notifications Inputs
  const [notifyBids, setNotifyBids] = useState(true)
  const [notifyNewsletter, setNotifyNewsletter] = useState(false)
  const [notifyReceipts, setNotifyReceipts] = useState(true)

  // Status State
  const [status, setStatus] = useState('idle') // 'loading', 'saving', 'success', 'error'
  const [message, setMessage] = useState('')
  const [errorObject, setErrorObject] = useState(null)
  const [rememberMfa, setRememberMfa] = useState(false)

  useEffect(() => {
    if (!auth) return

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check MFA expiration if they have MFA enrolled
        const hasTotp = currentUser.multiFactor?.enrolledFactors?.some(
          (f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID
        )
        if (hasTotp) {
          const isSessionVerified = sessionStorage.getItem('mfa_verified_session_' + currentUser.uid) === 'true'
          const rememberMfaVal = localStorage.getItem('mfa_remember_' + currentUser.uid) === 'true'
          const mfaVerifiedAt = parseInt(localStorage.getItem('mfa_verified_at_' + currentUser.uid) || '0', 10)
          const isWithinThreeDays = (Date.now() - mfaVerifiedAt) < (3 * 24 * 60 * 60 * 1000)

          if (!isSessionVerified && (!rememberMfaVal || !isWithinThreeDays)) {
            try {
              if (auth.currentUser) {
                const uid = auth.currentUser.uid
                localStorage.removeItem('mfa_remember_' + uid)
                localStorage.removeItem('mfa_verified_at_' + uid)
                sessionStorage.removeItem('mfa_verified_session_' + uid)
              }
              await signOut(auth)
            } catch (e) {
              console.error('Failed to sign out customer after MFA expired:', e)
            }
            return
          }
        }

        setUser(currentUser)
        // Fetch user data from Firestore
        await loadUserData(currentUser.uid, currentUser.email)
      } else {
        setUser(null)
        // Reset state
        resetInputs()
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!isOpen) {
      resetInputs()
    }
  }, [isOpen])

  function resetInputs() {
    setEmailInput('')
    setPasswordInput('')
    setNameInput('')
    setMfaResolver(null)
    setMfaCode('')
    setProfileName('')
    setProfilePhone('')
    setShippingStreet('')
    setShippingCity('')
    setShippingState('')
    setShippingZip('')
    setSameAsShipping(true)
    setBillingStreet('')
    setBillingCity('')
    setBillingState('')
    setBillingZip('')
    setNotifyBids(true)
    setNotifyNewsletter(false)
    setNotifyReceipts(true)
    setMessage('')
    setErrorObject(null)
    setStatus('idle')
  }

  async function loadUserData(uid, email) {
    setStatus('loading')
    try {
      const userDocRef = doc(db, 'users', uid)
      const userDocSnap = await getDoc(userDocRef)

      if (userDocSnap.exists()) {
        const data = userDocSnap.data()
        setProfileName(data.displayName || '')
        setProfilePhone(data.phone || '')

        if (data.shippingAddress) {
          setShippingStreet(data.shippingAddress.street || '')
          setShippingCity(data.shippingAddress.city || '')
          setShippingState(data.shippingAddress.state || '')
          setShippingZip(data.shippingAddress.zip || '')
        }

        setSameAsShipping(data.billingAddress?.sameAsShipping ?? true)
        if (data.billingAddress) {
          setBillingStreet(data.billingAddress.street || '')
          setBillingCity(data.billingAddress.city || '')
          setBillingState(data.billingAddress.state || '')
          setBillingZip(data.billingAddress.zip || '')
        }

        if (data.notifications) {
          setNotifyBids(data.notifications.biddingUpdates ?? true)
          setNotifyNewsletter(data.notifications.newsletter ?? false)
          setNotifyReceipts(data.notifications.purchaseReceipts ?? true)
        }
      } else {
        // Document doesn't exist, initialize it
        const initialProfile = {
          displayName: auth.currentUser?.displayName || '',
          email: email || '',
          phone: '',
          shippingAddress: { street: '', city: '', state: '', zip: '' },
          billingAddress: { street: '', city: '', state: '', zip: '', sameAsShipping: true },
          notifications: { biddingUpdates: true, newsletter: false, purchaseReceipts: true },
          createdAt: new Date().toISOString()
        }
        await setDoc(userDocRef, initialProfile)
        setProfileName(initialProfile.displayName)
      }
      setStatus('idle')
    } catch (err) {
      console.error('Error loading user data:', err)
      setStatus('error')
      setErrorObject(err)
    }
  }

  // Handle Authentication
  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setStatus('saving')
    setMessage('')
    setErrorObject(null)

    try {
      if (authMode === 'signin') {
        await setPersistence(auth, browserLocalPersistence)
        await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput)
        setStatus('idle')
      } else if (authMode === 'signup') {
        if (!nameInput.trim()) {
          throw new Error('Full Name is required.')
        }
        const userCredential = await createUserWithEmailAndPassword(auth, emailInput.trim(), passwordInput)
        await updateProfile(userCredential.user, { displayName: nameInput.trim() })

        // Initialize Firestore user doc
        const userDocRef = doc(db, 'users', userCredential.user.uid)
        await setDoc(userDocRef, {
          displayName: nameInput.trim(),
          email: emailInput.trim(),
          phone: '',
          shippingAddress: { street: '', city: '', state: '', zip: '' },
          billingAddress: { street: '', city: '', state: '', zip: '', sameAsShipping: true },
          notifications: { biddingUpdates: true, newsletter: false, purchaseReceipts: true },
          createdAt: new Date().toISOString()
        })

        setProfileName(nameInput.trim())
        setStatus('idle')
      } else if (authMode === 'forgot') {
        await apiRequest('/api/auth/password-reset', {
          method: 'POST',
          body: JSON.stringify({ email: emailInput.trim() })
        })
        setStatus('success')
        setMessage('Password reset email sent! Check your inbox.')
      }
    } catch (err) {
      console.error(err)
      if (err?.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, err)
        const totpHint = resolver.hints.find(
          (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID
        )
        if (!totpHint) {
          setStatus('error')
          setErrorObject(new Error('Authenticator app verification is required but not configured.'))
          return
        }
        setMfaResolver(resolver)
        setMfaCode('')
        setStatus('idle')
        setMessage('')
        return
      }
      setStatus('error')
      setErrorObject(err)
    }
  }

  const handleErrorAction = (action) => {
    if (action.type === 'switch_to_signup') {
      setAuthMode('signup')
      setErrorObject(null)
      setMessage('')
    } else if (action.type === 'switch_to_signin') {
      setAuthMode('signin')
      setErrorObject(null)
      setMessage('')
    } else if (action.type === 'switch_to_forgot') {
      setAuthMode('forgot')
      setErrorObject(null)
      setMessage('')
    }
  }

  const handleMfaSubmit = async (e) => {
    e.preventDefault()
    const verificationCode = mfaCode.trim()

    if (!/^\d{6}$/.test(verificationCode)) {
      setStatus('error')
      setErrorObject(new Error('Enter the 6-digit code from your authenticator app.'))
      return
    }

    const totpHint = mfaResolver?.hints?.find(
      (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID
    )

    if (!totpHint) {
      setStatus('error')
      setErrorObject(new Error('Authenticator app verification is not set up properly.'))
      return
    }

    setStatus('saving')
    setMessage('')
    setErrorObject(null)

    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, verificationCode)
      const userCredential = await mfaResolver.resolveSignIn(assertion)
      const user = userCredential.user

      if (rememberMfa) {
        localStorage.setItem('mfa_remember_' + user.uid, 'true')
        localStorage.setItem('mfa_verified_at_' + user.uid, Date.now().toString())
      } else {
        localStorage.removeItem('mfa_remember_' + user.uid)
        localStorage.removeItem('mfa_verified_at_' + user.uid)
      }
      sessionStorage.setItem('mfa_verified_session_' + user.uid, 'true')

      setMfaResolver(null)
      setMfaCode('')
      setStatus('idle')
    } catch (totpError) {
      console.error(totpError)
      setStatus('error')
      setErrorObject(totpError)
    }
  }

  // Handle Profile Update
  const handleProfileSave = async (e) => {
    e.preventDefault()
    if (!user) return

    setStatus('saving')
    setMessage('')

    try {
      const userDocRef = doc(db, 'users', user.uid)
      const updates = {}

      if (activeTab === 'profile') {
        updates.displayName = profileName.trim()
        updates.phone = profilePhone.trim()
        // Also update auth display name
        await updateProfile(user, { displayName: profileName.trim() })
      } else if (activeTab === 'address') {
        updates.shippingAddress = {
          street: shippingStreet.trim(),
          city: shippingCity.trim(),
          state: shippingState,
          zip: shippingZip.trim(),
        }
        updates.billingAddress = {
          sameAsShipping,
          street: sameAsShipping ? shippingStreet.trim() : billingStreet.trim(),
          city: sameAsShipping ? shippingCity.trim() : billingCity.trim(),
          state: sameAsShipping ? shippingState : billingState,
          zip: sameAsShipping ? shippingZip.trim() : billingZip.trim(),
        }
      } else if (activeTab === 'notifications') {
        updates.notifications = {
          biddingUpdates: notifyBids,
          newsletter: notifyNewsletter,
          purchaseReceipts: notifyReceipts,
        }
      }

      await updateDoc(userDocRef, updates)
      setStatus('success')
      setMessage('Profile updated successfully!')

      // Fade message out after 3 seconds
      setTimeout(() => {
        setMessage((m) => (m === 'Profile updated successfully!' ? '' : m))
        setStatus((s) => (s === 'success' ? 'idle' : s))
      }, 3000)
    } catch (err) {
      console.error(err)
      setStatus('error')
      setErrorObject(err)
    }
  }

  const handleSignOut = async () => {
    setStatus('saving')
    try {
      if (auth.currentUser) {
        const uid = auth.currentUser.uid
        localStorage.removeItem('mfa_remember_' + uid)
        localStorage.removeItem('mfa_verified_at_' + uid)
        sessionStorage.removeItem('mfa_verified_session_' + uid)
      }
      await signOut(auth)
      resetInputs()
      onClose()
    } catch (err) {
      console.error(err)
      setStatus('error')
      setErrorObject(err)
    }
  }

  return (
    <div className={`shopping-cart-drawer ${isOpen ? 'is-open' : ''}`} id="user-account" aria-hidden={!isOpen}>
      <button
        aria-label="Close account panel"
        className="drawer-backdrop"
        type="button"
        onClick={onClose}
      />
      <aside
        aria-labelledby="account-panel-title"
        aria-modal="true"
        className="cart-panel user-account-panel"
        role="dialog"
      >
        <div className="cart-panel-head">
          <div>
            <p className="cart-kicker">Account portal</p>
            <h2 id="account-panel-title">
              {user ? `Welcome, ${user.displayName || 'Collector'}` : 'Your Account'}
            </h2>
          </div>
          <button
            aria-label="Close account panel"
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        {/* NOT LOGGED IN CONTROLS */}
        {!user && (
          <div className="account-auth-container">
            {mfaResolver ? (
              <form onSubmit={handleMfaSubmit} className="account-form">
                <div className="forgot-kicker">
                  <h3>Two-step verification</h3>
                  <p>Enter the current 6-digit code from your authenticator app.</p>
                </div>

                <label className="checkout-field">
                  <span>6-digit code</span>
                  <input
                    required
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength="6"
                    pattern="[0-9]{6}"
                    placeholder="123456"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>

                {status === 'error' && errorObject ? (
                  <FriendlyAlert error={errorObject} context="customer" onAction={handleErrorAction} style={{ margin: '8px 0 0' }} />
                ) : message ? (
                  <p className={`account-message is-${status}`} role="status">
                    {message}
                  </p>
                ) : null}

                <button
                  type="submit"
                  className="button primary account-submit-btn"
                  disabled={status === 'saving'}
                >
                  {status === 'saving' ? 'Verifying...' : 'Verify'}
                </button>

                <button
                  type="button"
                  className="button secondary account-cancel-btn"
                  onClick={() => {
                    setMfaResolver(null)
                    setMfaCode('')
                    setMessage('')
                    setStatus('idle')
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                {authMode !== 'forgot' && (
                  <div className="account-auth-tabs">
                    <button
                      className={`auth-tab ${authMode === 'signin' ? 'is-active' : ''}`}
                      onClick={() => {
                        setAuthMode('signin')
                        setMessage('')
                      }}
                    >
                      Sign In
                    </button>
                    <button
                      className={`auth-tab ${authMode === 'signup' ? 'is-active' : ''}`}
                      onClick={() => {
                        setAuthMode('signup')
                        setMessage('')
                      }}
                    >
                      Create Account
                    </button>
                  </div>
                )}

                <form onSubmit={handleAuthSubmit} className="account-form">
                  {authMode === 'forgot' && (
                    <div className="forgot-kicker">
                      <h3>Reset your password</h3>
                      <p>Enter your email address and we'll send you a link to reset your password.</p>
                    </div>
                  )}

                  {authMode === 'signup' && (
                    <label className="checkout-field">
                      <span>Full Name</span>
                      <input
                        required
                        type="text"
                        placeholder="John Doe"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                      />
                    </label>
                  )}

                  <label className="checkout-field">
                    <span>Email Address</span>
                    <input
                      required
                      type="email"
                      placeholder="your@email.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                    />
                  </label>

                  {authMode !== 'forgot' && (
                    <label className="checkout-field">
                      <span>Password</span>
                      <input
                        required
                        type="password"
                        placeholder="••••••••"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                      />
                    </label>
                  )}

                  {authMode === 'signin' && (
                    <label className="checkbox-field-label" style={{ margin: '12px 0 8px' }}>
                      <input
                        type="checkbox"
                        checked={rememberMfa}
                        onChange={(e) => setRememberMfa(e.target.checked)}
                      />
                      <div>
                        <strong>Do not ask again for 3 days</strong>
                        <span>Trust this device for two-step verification.</span>
                      </div>
                    </label>
                  )}

                  {authMode === 'signin' && (
                    <button
                      type="button"
                      className="forgot-password-link"
                      onClick={() => {
                        setAuthMode('forgot')
                        setMessage('')
                      }}
                    >
                      Forgot your password?
                    </button>
                  )}

                  {status === 'error' && errorObject ? (
                    <FriendlyAlert error={errorObject} context="customer" onAction={handleErrorAction} style={{ margin: '8px 0 0' }} />
                  ) : message ? (
                    <p className={`account-message is-${status}`} role="status">
                      {message}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    className="button primary account-submit-btn"
                    disabled={status === 'saving'}
                  >
                    {status === 'saving'
                      ? 'Processing...'
                      : authMode === 'signin'
                        ? 'Sign In'
                        : authMode === 'signup'
                          ? 'Register Account'
                          : 'Send Reset Link'}
                  </button>

                  {authMode === 'forgot' && (
                    <button
                      type="button"
                      className="button secondary account-cancel-btn"
                      onClick={() => {
                        setAuthMode('signin')
                        setMessage('')
                      }}
                    >
                      Back to Sign In
                    </button>
                  )}
                </form>
              </>
            )}
          </div>
        )}

        {/* LOGGED IN CONTROLS */}
        {user && (
          <>
            <div className="account-tabs-nav">
              <button
                className={`account-nav-tab ${activeTab === 'profile' ? 'is-active' : ''}`}
                onClick={() => {
                  setActiveTab('profile')
                  setMessage('')
                }}
              >
                Profile
              </button>
              <button
                className={`account-nav-tab ${activeTab === 'address' ? 'is-active' : ''}`}
                onClick={() => {
                  setActiveTab('address')
                  setMessage('')
                }}
              >
                Addresses
              </button>
              <button
                className={`account-nav-tab ${activeTab === 'notifications' ? 'is-active' : ''}`}
                onClick={() => {
                  setActiveTab('notifications')
                  setMessage('')
                }}
              >
                Emails
              </button>
            </div>

            <div className="account-tab-scroll">
              <form onSubmit={handleProfileSave} className="account-form-fields">
                {status === 'loading' && <p className="account-loading-text">Loading profile...</p>}

                {activeTab === 'profile' && status !== 'loading' && (
                  <div className="account-field-group">
                    <label className="checkout-field">
                      <span>Full Name</span>
                      <input
                        required
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                      />
                    </label>
                    <label className="checkout-field">
                      <span>Phone Number</span>
                      <input
                        type="tel"
                        placeholder="(555) 555-5555"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                      />
                    </label>
                    <label className="checkout-field is-disabled">
                      <span>Account Email (Read-Only)</span>
                      <input
                        disabled
                        type="email"
                        value={user.email || ''}
                      />
                    </label>
                  </div>
                )}

                {activeTab === 'address' && status !== 'loading' && (
                  <div className="account-field-group">
                    <h3 className="section-subtitle">Shipping Address</h3>
                    <label className="checkout-field">
                      <span>Street Address</span>
                      <input
                        type="text"
                        placeholder="123 Main St"
                        value={shippingStreet}
                        onChange={(e) => setShippingStreet(e.target.value)}
                      />
                    </label>
                    <div className="address-row-grid">
                      <label className="checkout-field">
                        <span>City</span>
                        <input
                          type="text"
                          placeholder="Wallington"
                          value={shippingCity}
                          onChange={(e) => setShippingCity(e.target.value)}
                        />
                      </label>
                      <label className="checkout-field">
                        <span>State</span>
                        <select
                          value={shippingState}
                          onChange={(e) => setShippingState(e.target.value)}
                        >
                          <option value="">Select State</option>
                          {states.map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </label>
                      <label className="checkout-field">
                        <span>ZIP Code</span>
                        <input
                          type="text"
                          placeholder="07057"
                          value={shippingZip}
                          onChange={(e) => setShippingZip(e.target.value)}
                        />
                      </label>
                    </div>

                    <label className="checkbox-field-label">
                      <input
                        type="checkbox"
                        checked={sameAsShipping}
                        onChange={(e) => setSameAsShipping(e.target.checked)}
                      />
                      <span>Billing address is same as shipping</span>
                    </label>

                    {!sameAsShipping && (
                      <div className="billing-address-section">
                        <h3 className="section-subtitle">Billing Address</h3>
                        <label className="checkout-field">
                          <span>Street Address</span>
                          <input
                            type="text"
                            placeholder="456 Oak Ave"
                            value={billingStreet}
                            onChange={(e) => setBillingStreet(e.target.value)}
                          />
                        </label>
                        <div className="address-row-grid">
                          <label className="checkout-field">
                            <span>City</span>
                            <input
                              type="text"
                              placeholder="Clifton"
                              value={billingCity}
                              onChange={(e) => setBillingCity(e.target.value)}
                            />
                          </label>
                          <label className="checkout-field">
                            <span>State</span>
                            <select
                              value={billingState}
                              onChange={(e) => setBillingState(e.target.value)}
                            >
                              <option value="">Select State</option>
                              {states.map(st => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </label>
                          <label className="checkout-field">
                            <span>ZIP Code</span>
                            <input
                              type="text"
                              placeholder="07011"
                              value={billingZip}
                              onChange={(e) => setBillingZip(e.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'notifications' && status !== 'loading' && (
                  <div className="account-field-group">
                    <h3 className="section-subtitle">Email Settings</h3>
                    <p className="field-explanation">
                      Receive notices about actions you take on the site.
                    </p>
                    
                    <label className="checkbox-field-label">
                      <input
                        type="checkbox"
                        checked={notifyBids}
                        onChange={(e) => setNotifyBids(e.target.checked)}
                      />
                      <div>
                        <strong>Bidding Notifications</strong>
                        <span>Receive emails when you place a bid, get outbid, or win an auction.</span>
                      </div>
                    </label>

                    <label className="checkbox-field-label">
                      <input
                        type="checkbox"
                        checked={notifyReceipts}
                        onChange={(e) => setNotifyReceipts(e.target.checked)}
                      />
                      <div>
                        <strong>Purchase Receipts</strong>
                        <span>Get invoice copies and order confirmations sent automatically.</span>
                      </div>
                    </label>

                    <label className="checkbox-field-label">
                      <input
                        type="checkbox"
                        checked={notifyNewsletter}
                        onChange={(e) => setNotifyNewsletter(e.target.checked)}
                      />
                      <div>
                        <strong>Store Updates & Events</strong>
                        <span>Get notified about pop-up sales, drops, and community events.</span>
                      </div>
                    </label>
                  </div>
                )}

                {status === 'error' && errorObject ? (
                  <FriendlyAlert error={errorObject} context="customer" onAction={handleErrorAction} style={{ margin: '8px 0 0' }} />
                ) : message ? (
                  <p className={`account-message is-${status}`} role="status">
                    {message}
                  </p>
                ) : null}

                {status !== 'loading' && (
                  <button
                    type="submit"
                    className="button primary save-settings-btn"
                    disabled={status === 'saving'}
                  >
                    {status === 'saving' ? 'Saving Changes...' : 'Save Settings'}
                  </button>
                )}
              </form>
            </div>

            <div className="account-drawer-footer">
              <button
                type="button"
                className="button secondary sign-out-btn"
                onClick={handleSignOut}
              >
                Sign Out
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
