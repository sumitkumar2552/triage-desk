const TOKEN_KEY = 'triage.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * Thin wrapper over fetch. Attaches the token, unwraps JSON, and turns any
 * non-2xx response into a thrown Error carrying the server's own message, so
 * every caller can just try/catch and show error.message.
 */
export async function api(path, { method = 'GET', body } = {}) {
  const token = tokenStore.get();

  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Empty or non-JSON body; leave data as null.
  }

  if (!response.ok) {
    if (response.status === 401) tokenStore.clear();
    throw new Error(data?.error || `Request failed (${response.status})`);
  }

  return data;
}
