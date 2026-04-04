// api.js – Backend API calls with Firebase token support
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = window.location.origin; // served from the same Flask server

/**
 * Get the current user's Firebase ID token.
 * If the token is close to expiry it will be refreshed automatically.
 */
async function getIdToken() {
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken(/* forceRefresh */ false);
}

/**
 * Generic authenticated fetch helper.
 */
async function authFetch(path, options = {}) {
  const token = await getIdToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ── API Methods ───────────────────────────────────────────────────────────

/**
 * Transcribe a file upload (multipart/form-data).
 */
async function apiTranscribeFile(file) {
  const token = await getIdToken();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method : 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body   : formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Transcription failed');
  return data;
}

/**
 * Upload and summarize a document (PDF, DOCX, PPTX).
 */
async function apiUploadDocument(file, summaryLength = 'medium') {
  const token = await getIdToken();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('summary_length', summaryLength);

  const res = await fetch(`${API_BASE}/api/upload-document`, {
    method : 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body   : formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Document processing failed');
  return data;
}

/**
 * Transcribe from a YouTube / remote URL.
 */
async function apiTranscribeUrl(url) {
  return authFetch('/api/transcribe', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ source_type: 'url', url }),
  });
}

/**
 * Pass raw text through (no audio transcription).
 */
async function apiTranscribeText(text) {
  return authFetch('/api/transcribe', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ source_type: 'text', text }),
  });
}

/**
 * Summarize a transcript and save to Firestore.
 */
async function apiSummarize(transcript, summaryLength, sourceType, sourceName) {
  return authFetch('/api/summarize', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({
      transcript,
      summary_length: summaryLength,
      source_type   : sourceType,
      source_name   : sourceName,
    }),
  });
}

/**
 * Get all records for the current user.
 */
async function apiGetRecords() {
  return authFetch('/api/records');
}

/**
 * Delete a specific record.
 */
async function apiDeleteRecord(recordId) {
  return authFetch(`/api/records/${recordId}`, { method: 'DELETE' });
}
