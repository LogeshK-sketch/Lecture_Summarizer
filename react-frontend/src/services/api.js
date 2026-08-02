import { auth } from './firebase';

const API_BASE = window.location.origin === 'http://localhost:5173' || window.location.origin === 'http://localhost:3000' 
  ? 'http://localhost:10000' // Render default port or local flask port
  : window.location.origin;

// In local environment, the Flask server defaults to port 10000 (from app.py) or 5000 depending on PORT env. Let's make sure it handles both.
// Actually, let's use the local fallback dynamically or just check if it's localhost and fallback to 10000 or 5000.
// Let's use http://localhost:10000 as default fallback, but we'll try to discover if it's running on 10000.
const getApiBase = () => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // If we are developing locally, the flask port might be 10000 or 5000
    // We can default to 10000 since app.py fallback is 10000.
    return 'http://localhost:10000';
  }
  return window.location.origin;
};

const BASE_URL = getApiBase();

async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken(false);
}

async function authFetch(path, options = {}) {
  const token = await getIdToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }
  
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return res;
}

export async function apiTranscribeFile(file) {
  const token = await getIdToken();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE_URL}/api/transcribe`, {
    method : 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body   : formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Transcription failed');
  return data;
}

export async function apiUploadDocument(file, summaryLength = 'medium') {
  const token = await getIdToken();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('summary_length', summaryLength);

  const res = await fetch(`${BASE_URL}/api/upload-document`, {
    method : 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body   : formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Document processing failed');
  return data;
}

export async function apiTranscribeUrl(url) {
  return authFetch('/api/transcribe', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ source_type: 'url', url }),
  });
}

export async function apiTranscribeText(text) {
  return authFetch('/api/transcribe', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ source_type: 'text', text }),
  });
}

export async function apiSummarize(transcript, summaryLength, sourceType, sourceName) {
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

export async function apiGetRecords() {
  return authFetch('/api/records');
}

export async function apiDeleteRecord(recordId) {
  return authFetch(`/api/records/${recordId}`, { method: 'DELETE' });
}

export async function apiExportPdf(summary, keyPoints) {
  const token = await getIdToken();
  const res = await fetch(`${BASE_URL}/api/export/pdf`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ summary, key_points: keyPoints }),
  });
  if (!res.ok) throw new Error('PDF export failed');
  return res.blob();
}

export async function apiExportText(summary, keyPoints) {
  const token = await getIdToken();
  const res = await fetch(`${BASE_URL}/api/export/text`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ summary, key_points: keyPoints }),
  });
  if (!res.ok) throw new Error('Text export failed');
  return res.blob();
}

export async function apiVisualize(summary) {
  return authFetch('/api/visualize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary }),
  });
}
