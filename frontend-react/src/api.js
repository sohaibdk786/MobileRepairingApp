// Same shared fetch helper as the original vanilla app (frontend/api.js
// in the old build) -- ported logic-for-logic, not rewritten, so every
// call site's error-handling behaviour stays identical.

async function apiRequest(method, url, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    // No JSON body (e.g. a network-level failure) -- fall through and
    // let the generic message below apply.
  }
  if (!res.ok) {
    const message = data && data.detail ? data.detail : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (url) => apiRequest("GET", url),
  post: (url, body) => apiRequest("POST", url, body === undefined ? {} : body),
  put: (url, body) => apiRequest("PUT", url, body === undefined ? {} : body),
  patch: (url, body) => apiRequest("PATCH", url, body === undefined ? {} : body),
  del: (url) => apiRequest("DELETE", url),
};
