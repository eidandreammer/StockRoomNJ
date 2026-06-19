const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function endpoint(path) {
  return `${apiBaseUrl}${path}`
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(endpoint(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`)
  }

  return payload
}

export async function authorizedApiRequest(path, currentUser, options = {}) {
  if (!currentUser) {
    throw new Error('Admin sign-in is required.')
  }

  const token = await currentUser.getIdToken()

  return apiRequest(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })
}
