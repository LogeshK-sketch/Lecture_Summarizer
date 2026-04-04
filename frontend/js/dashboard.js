// dashboard.js – All dashboard UI logic
// ─────────────────────────────────────────────────────────────────────────────

// ── State ──────────────────────────────────────────────────────────────────
let currentUser        = null;
let currentTranscript  = '';
let currentSourceType  = 'text';
let currentSourceName  = '';
let selectedFile       = null;
let selectedDocument   = null;
let recordedAudioFile  = null;
let mediaRecorder      = null;
let audioStream        = null;
let recordingStartTime = null;
let recordingTimer     = null;
let lengthSettings     = { upload: 'medium', document: 'medium', text: 'medium', url: 'medium', result: 'medium' };

// ── Settings State ─────────────────────────────────────────────────────────
let appSettings = {
  defaultLength: 'medium',
  transcriptionModel: 'base',
};

// Load settings on boot
function loadSettings() {
  const saved = localStorage.getItem('appSettings');
  if (saved) {
    try { appSettings = { ...appSettings, ...JSON.parse(saved) }; }
    catch(e) { console.error('Failed to load settings:', e); }
  }
  syncSettingsUI();
  // Apply default lengths globally
  Object.keys(lengthSettings).forEach(k => { lengthSettings[k] = appSettings.defaultLength; });
}

function syncSettingsUI() {
  // Length buttons
  ['short', 'medium', 'long'].forEach(len => {
    const btn = document.getElementById(`sopt-${len}`);
    if (btn) btn.classList.toggle('active', len === appSettings.defaultLength);
  });
  // Model dropdown in settings panel
  const sel = document.getElementById('settings-model-select');
  if (sel) sel.value = appSettings.transcriptionModel;
  // STT model select in main panel
  const stt = document.getElementById('stt-model-select');
  if (stt) stt.value = appSettings.transcriptionModel;
  // Theme toggle checkbox
  const themeChk = document.getElementById('settings-theme-toggle');
  const themeLabel = document.getElementById('settings-theme-label');
  const isLight = document.body.classList.contains('light-mode');
  if (themeChk) themeChk.checked = isLight;
  if (themeLabel) themeLabel.textContent = isLight ? 'Light' : 'Dark';
}

function openSettingsModal() {
  // Populate account info when opening
  if (currentUser) {
    const nameEl = document.getElementById('settings-display-name');
    const emailEl = document.getElementById('settings-email');
    if (nameEl) nameEl.textContent = currentUser.displayName || 'Not set';
    if (emailEl) emailEl.textContent = currentUser.email || 'Not set';
  }
  syncSettingsUI();
  openModal('modal-settings');
}

function setDefaultLength(len) {
  appSettings.defaultLength = len;
  ['short', 'medium', 'long'].forEach(l => {
    const btn = document.getElementById(`sopt-${l}`);
    if (btn) btn.classList.toggle('active', l === len);
  });
  Object.keys(lengthSettings).forEach(k => { lengthSettings[k] = len; });
  localStorage.setItem('appSettings', JSON.stringify(appSettings));
  showToast(`Default length set to "${len}"`, 'success', 2000);
}

function setDefaultModel(model) {
  appSettings.transcriptionModel = model;
  const stt = document.getElementById('stt-model-select');
  if (stt) stt.value = model;
  localStorage.setItem('appSettings', JSON.stringify(appSettings));
  showToast(`Whisper model set to "${model}"`, 'success', 2000);
}

function settingsToggleTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
  } else {
    document.body.classList.remove('light-mode');
    localStorage.setItem('theme', 'dark');
  }
  const label = document.getElementById('settings-theme-label');
  if (label) label.textContent = isLight ? 'Light' : 'Dark';
  // also sync the header theme icon
  const svgIcon = document.getElementById('theme-icon');
  if (svgIcon) {
    svgIcon.innerHTML = isLight
      ? `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`
      : `<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>`;
  }
}

async function sendPasswordReset() {
  if (!currentUser || !currentUser.email) {
    showToast('No user email found.', 'error'); return;
  }
  try {
    await firebase.auth().sendPasswordResetEmail(currentUser.email);
    showToast(`Password reset email sent to ${currentUser.email}`, 'success');
  } catch(e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

async function deleteAllRecords() {
  if (!confirm('Are you sure? This will permanently delete ALL your records.')) return;
  showSpinner('Deleting records…', 'This may take a moment');
  try {
    const res = await apiGetRecords();
    const records = res.records || [];
    await Promise.all(records.map(r => apiDeleteRecord(r.id)));
    showToast(`Deleted ${records.length} record(s).`, 'success');
    const grid = document.getElementById('records-grid');
    if (grid) grid.innerHTML = '';
  } catch(e) {
    showToast(`Error: ${e.message}`, 'error');
  } finally {
    hideSpinner();
  }
}




// ── Theme State ────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const savedTheme = localStorage.getItem('theme');
  // the design defaults to dark theme, so we only apply light mode if saved
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    const svgIcon = document.getElementById('theme-icon');
    if(svgIcon) svgIcon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
  }
});

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  const svgIcon = document.getElementById('theme-icon');
  if(svgIcon) {
    if (isLight) {
      // Sun Icon
      svgIcon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
    } else {
      // Moon Icon
      svgIcon.innerHTML = `<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>`;
    }
  }
}

// ── Auth Guard ─────────────────────────────────────────────────────────────
firebase.auth().onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = '/';
    return;
  }
  currentUser = user;
  initDashboard(user);
});

function initDashboard(user) {
  // Set greeting
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  document.getElementById('greeting-part').textContent = part;

  const displayName = user.displayName || user.email.split('@')[0];
  document.getElementById('greeting-name').textContent = displayName;

  // Date string
  const now = new Date();
  document.getElementById('greeting-date').textContent =
    now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Sidebar user info
  document.getElementById('sidebar-user-name').textContent = user.displayName || 'User';
  document.getElementById('sidebar-user-email').textContent = user.email || '';

  // Avatar initials
  const initials = (user.displayName || user.email || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('user-avatar-initials').textContent = initials;

  // Apply saved settings
  loadSettings();
}

// ── Panel switching ────────────────────────────────────────────────────────
function switchPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`panel-${name}`).classList.add('active');
  document.getElementById(`nav-${name}`).classList.add('active');

  if (name === 'records') loadRecords();
}

function switchRecordTab(tabId) {
  ['transcript', 'summary', 'points'].forEach(id => {
    const btn = document.getElementById(`tab-${id}`);
    const content = document.getElementById(`tab-${id}`);
    if (btn && content) {
      if (id === tabId) {
        btn.classList.add('active');
        content.classList.add('active');
      } else {
        btn.classList.remove('active');
        content.classList.remove('active');
      }
    }
  });
}

// ── Modal helpers ──────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(o => closeModal(o.id));
  }
});

// ── Length selector ────────────────────────────────────────────────────────
function setLength(modalType, len) {
  lengthSettings[modalType] = len;
  ['short', 'medium', 'long'].forEach(l => {
    const btn = document.getElementById(`${modalType}-len-${l}`);
    if (btn) btn.classList.toggle('active', l === len);
  });
}

function updateRecordingStatus(message, active = false) {
  const statusEl = document.getElementById('recording-status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = active ? 'var(--accent)' : 'var(--text-muted)';
}

function formatRecordingTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Your browser does not support microphone recording.', 'error');
    return;
  }

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(audioStream);
    const chunks = [];

    mediaRecorder.addEventListener('dataavailable', event => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    });

    mediaRecorder.addEventListener('stop', () => {
      recordedAudioFile = new File(chunks, 'voice_recording.webm', { type: 'audio/webm' });
      document.getElementById('btn-submit-voice').disabled = false;
      updateRecordingStatus(`Recording complete — ${formatRecordingTime((Date.now() - recordingStartTime) / 1000)}`);
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }
      clearInterval(recordingTimer);
      recordingTimer = null;
    });

    mediaRecorder.start();
    recordingStartTime = Date.now();
    updateRecordingStatus('Recording... 00:00', true);
    document.getElementById('btn-start-recording').disabled = true;
    document.getElementById('btn-stop-recording').disabled = false;
    document.getElementById('btn-submit-voice').disabled = true;

    recordingTimer = setInterval(() => {
      const elapsed = (Date.now() - recordingStartTime) / 1000;
      updateRecordingStatus(`Recording... ${formatRecordingTime(elapsed)}`, true);
    }, 500);
  } catch (err) {
    showToast(`Unable to start recording: ${err.message}`, 'error');
  }
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    return;
  }
  mediaRecorder.stop();
  document.getElementById('btn-start-recording').disabled = false;
  document.getElementById('btn-stop-recording').disabled = true;
}

async function submitVoiceRecording() {
  if (!recordedAudioFile) {
    showToast('Please record your voice first.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-voice');
  btn.disabled = true;

  try {
    showSpinner('Transcribing voice…', 'Uploading your recording and transcribing to text');
    const transcribeRes = await apiTranscribeFile(recordedAudioFile);
    currentTranscript = transcribeRes.transcript;
    currentSourceType = 'voice';
    currentSourceName = 'Voice recording';
    displayTranscript(currentTranscript);

    updateSpinner('Generating summary…', 'Extracting key points with LSA');
    const summarizeRes = await apiSummarize(
      currentTranscript,
      lengthSettings.upload,
      currentSourceType,
      currentSourceName
    );
    displaySummary(summarizeRes.summary);
    displayKeyPoints(summarizeRes.key_points);
    showToast('Voice transcription and summary complete!', 'success');
    lengthSettings.result = lengthSettings.upload;
    syncResultLengthBtns();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideSpinner();
    btn.disabled = false;
  }
}

function resummarize(len) {
  lengthSettings['result'] = len;
  ['short', 'medium', 'long'].forEach(l => {
    const btn = document.getElementById(`res-len-${l}`);
    if (btn) btn.classList.toggle('active', l === len);
  });
  document.getElementById('btn-resummarize').disabled = !currentTranscript;
}

// ── Spinner / Loading ──────────────────────────────────────────────────────
function showSpinner(label = 'Processing…', step = '') {
  document.getElementById('spinner-label').textContent = label;
  document.getElementById('spinner-step').textContent  = step;
  document.getElementById('spinner-overlay').classList.add('visible');
}
function updateSpinner(label, step = '') {
  document.getElementById('spinner-label').textContent = label;
  document.getElementById('spinner-step').textContent  = step;
}
function hideSpinner() {
  document.getElementById('spinner-overlay').classList.remove('visible');
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', durationMs = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

// ── Copy text ──────────────────────────────────────────────────────────────
function copyText(elementId) {
  const el = document.getElementById(elementId);
  const text = el.innerText || el.textContent;
  if (!text.trim()) return;
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'success', 2000));
}

// ── File drag & drop ──────────────────────────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('upload-drop-zone').classList.add('drag-over');
}
function handleDragLeave(e) {
  document.getElementById('upload-drop-zone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-drop-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
}
function handleFileSelect(file) {
  if (!file) return;
  selectedFile = file;
  document.getElementById('upload-filename').textContent = `📎 ${file.name}`;
  document.getElementById('btn-submit-upload').disabled = false;
}

// ── Submit: File Upload ────────────────────────────────────────────────────
async function submitUpload() {
  if (!selectedFile) return;
  const btn = document.getElementById('btn-submit-upload');
  btn.disabled = true;
  closeModal('modal-upload');

  try {
    showSpinner('Transcribing audio…', 'This may take a while for large files');
    const transcribeRes = await apiTranscribeFile(selectedFile);
    currentTranscript  = transcribeRes.transcript;
    currentSourceType  = 'file';
    currentSourceName  = selectedFile.name;
    displayTranscript(currentTranscript);

    updateSpinner('Generating summary…', 'Extracting key points with LSA');
    const summarizeRes = await apiSummarize(
      currentTranscript,
      lengthSettings['upload'],
      currentSourceType,
      currentSourceName
    );
    displaySummary(summarizeRes.summary);
    displayKeyPoints(summarizeRes.key_points);
    showToast('Done! Transcript and summary ready.', 'success');
    lengthSettings['result'] = lengthSettings['upload'];
    syncResultLengthBtns();

  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideSpinner();
    btn.disabled = false;
    selectedFile = null;
    document.getElementById('upload-filename').textContent = '';
  }
}

// ── Submit: Document Upload ────────────────────────────────────────────────
function handleDocDrop(e) {
  e.preventDefault();
  document.getElementById('document-drop-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleDocSelect(file);
}

function handleDocSelect(file) {
  if (!file) return;
  selectedDocument = file;
  document.getElementById('document-filename').textContent = `📄 ${file.name}`;
  document.getElementById('btn-submit-document').disabled = false;
}

async function submitDocument() {
  if (!selectedDocument) return;
  const btn = document.getElementById('btn-submit-document');
  btn.disabled = true;
  closeModal('modal-document');

  try {
    showSpinner('Processing document…', 'Extracting text and generating summary');
    const docRes = await apiUploadDocument(selectedDocument, lengthSettings['document']);
    
    currentTranscript  = docRes.transcript;
    currentSourceType  = 'file';
    currentSourceName  = docRes.file_name || selectedDocument.name;
    
    displayTranscript(currentTranscript);
    displaySummary(docRes.summary);
    displayKeyPoints(docRes.key_points);
    showToast('Document summarized successfully!', 'success');
    
    lengthSettings['result'] = lengthSettings['document'];
    syncResultLengthBtns();

  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideSpinner();
    btn.disabled = false;
    selectedDocument = null;
    document.getElementById('document-filename').textContent = '';
  }
}

// ── Submit: Paste Text ────────────────────────────────────────────────────
async function submitText() {
  const text = document.getElementById('paste-text').value.trim();
  if (!text) { showToast('Please paste some text first.', 'error'); return; }

  // Detect if the pasted text is a URL
  try {
    const parsedUrl = new URL(text);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      closeModal('modal-text');
      document.getElementById('url-input').value = text;
      lengthSettings['url'] = lengthSettings['text'];
      submitUrl();
      return;
    }
  } catch (e) {
    // Not a valid URL, continue as text
  }

  const btn = document.getElementById('btn-submit-text');
  btn.disabled = true;
  closeModal('modal-text');

  try {
    showSpinner('Processing text…', 'Running LSA summarization');
    const transcribeRes = await apiTranscribeText(text);
    currentTranscript  = transcribeRes.transcript;
    currentSourceType  = 'text';
    currentSourceName  = 'Pasted text';
    displayTranscript(currentTranscript);

    updateSpinner('Generating summary…', 'Extracting key points');
    const summarizeRes = await apiSummarize(
      currentTranscript,
      lengthSettings['text'],
      currentSourceType,
      currentSourceName
    );
    displaySummary(summarizeRes.summary);
    displayKeyPoints(summarizeRes.key_points);
    showToast('Summary generated!', 'success');
    lengthSettings['result'] = lengthSettings['text'];
    syncResultLengthBtns();

  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideSpinner();
    btn.disabled = false;
  }
}

// ── Submit: URL Transcribe ─────────────────────────────────────────────────
async function submitUrl() {
  const url = document.getElementById('url-input').value.trim();
  if (!url) { showToast('Please enter a URL.', 'error'); return; }

  const btn = document.getElementById('btn-submit-url');
  btn.disabled = true;
  closeModal('modal-url');

  try {
    showSpinner('Downloading audio…', 'Fetching media from URL');
    const transcribeRes = await apiTranscribeUrl(url);
    currentTranscript  = transcribeRes.transcript;
    currentSourceType  = 'url';
    currentSourceName  = url;
    displayTranscript(currentTranscript);

    updateSpinner('Generating summary…', 'Extracting key points with LSA');
    const summarizeRes = await apiSummarize(
      currentTranscript,
      lengthSettings['url'],
      currentSourceType,
      currentSourceName
    );
    displaySummary(summarizeRes.summary);
    displayKeyPoints(summarizeRes.key_points);
    showToast('Transcription and summary complete!', 'success');
    lengthSettings['result'] = lengthSettings['url'];
    syncResultLengthBtns();

  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideSpinner();
    btn.disabled = false;
  }
}

// ── Re-summarize ───────────────────────────────────────────────────────────
async function doResummarize() {
  if (!currentTranscript) return;
  const btn = document.getElementById('btn-resummarize');
  btn.disabled = true;

  try {
    showSpinner('Re-summarizing…', `Length: ${lengthSettings['result']}`);
    const res = await apiSummarize(
      currentTranscript,
      lengthSettings['result'],
      currentSourceType,
      currentSourceName
    );
    displaySummary(res.summary);
    displayKeyPoints(res.key_points);
    showToast('Summary updated!', 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideSpinner();
    btn.disabled = false;
  }
}

function syncResultLengthBtns() {
  ['short', 'medium', 'long'].forEach(l => {
    const btn = document.getElementById(`res-len-${l}`);
    if (btn) btn.classList.toggle('active', l === lengthSettings['result']);
  });
}

// ── Display helpers ────────────────────────────────────────────────────────
function displayTranscript(text) {
  const el = document.getElementById('transcript-output');
  el.textContent = text;
  document.getElementById('output-section').classList.add('visible');
  document.getElementById('btn-resummarize').disabled = false;

  // Scroll to output
  document.getElementById('output-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function displaySummary(text) {
  document.getElementById('summary-output').textContent = text;
}

function displayKeyPoints(points) {
  const el = document.getElementById('key-points-output');
  if (!points || !points.length) {
    el.innerHTML = '<li class="output-placeholder">No key points generated.</li>';
    return;
  }
  el.innerHTML = points.map(pt => `<li style="margin-bottom: 8px; position: relative; padding-left: 14px;"><span style="position: absolute; left: 0; color: var(--accent);">•</span>${pt}</li>`).join('');
}

// ── Load Records ───────────────────────────────────────────────────────────
async function loadRecords() {
  const grid = document.getElementById('records-grid');
  grid.innerHTML = '<div class="records-empty" style="grid-column:1/-1;"><div class="spinner" style="margin:0 auto 12px;"></div>Loading records…</div>';

  try {
    const res = await apiGetRecords();
    renderRecords(res.records || []);
  } catch (err) {
    grid.innerHTML = `<div class="records-empty" style="grid-column:1/-1;">Error loading records: ${err.message}</div>`;
  }
}

function renderRecords(records) {
  const grid = document.getElementById('records-grid');
  if (!records.length) {
    grid.innerHTML = `
      <div class="records-empty" style="grid-column:1/-1;">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        No records yet. Start by transcribing something!
      </div>`;
    
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);

    return;
  }

  // Order records newest first by created_at timestamp.
  records = records.slice().sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  grid.innerHTML = records.map(r => {
    const badgeClass = { file: 'badge-file', text: 'badge-text', url: 'badge-url', voice: 'badge-voice' }[r.source_type] || 'badge-text';
    const badgeLabel = { file: '📁 File', text: '✏️ Text', url: '🔗 URL', voice: '🎙️ Voice' }[r.source_type] || r.source_type;
    const date = r.created_at ? new Date(r.created_at).toLocaleString() : '';
    const preview = (r.summary || '').slice(0, 200);

    return `
    <div class="record-card" onclick="openRecord(${JSON.stringify(r).replace(/"/g, '&quot;')})">
      <div class="record-card-header">
        <span class="record-badge ${badgeClass}">${badgeLabel}</span>
        <span class="record-meta">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          ${date}
        </span>
      </div>
      <p class="record-summary">${preview}${r.summary && r.summary.length > 200 ? '…' : ''}</p>
      <div class="record-card-footer">
        <span class="record-length-badge">${r.summary_length || 'medium'} summary</span>
        <button class="btn-delete-record" onclick="deleteRecord(event, '${r.id}')" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>`;
  }).join('');

  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 100);
}

function openRecord(record) {
  document.getElementById('modal-record-title').textContent =
    record.source_name ? `Record: ${record.source_name}` : 'Record Detail';
  document.getElementById('record-transcript-text').textContent = record.transcript || '(no transcript)';
  document.getElementById('record-summary-text').textContent    = record.summary    || '(no summary)';
  
  const kpEl = document.getElementById('record-key-points-text');
  if (record.key_points && record.key_points.length) {
    kpEl.innerHTML = record.key_points.map(pt => `<li style="margin-bottom: 8px; position: relative; padding-left: 14px;"><span style="position: absolute; left: 0; color: var(--accent);">•</span>${pt}</li>`).join('');
  } else {
    kpEl.innerHTML = '<li class="output-placeholder">No key points available.</li>';
  }
  
  openModal('modal-record');
}

async function deleteRecord(event, recordId) {
  event.stopPropagation();
  if (!confirm('Delete this record?')) return;
  try {
    await apiDeleteRecord(recordId);
    showToast('Record deleted.', 'success');
    loadRecords();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────
async function handleLogout() {
  try {
    await firebase.auth().signOut();
    window.location.href = '/';
  } catch (err) {
    showToast('Error signing out.', 'error');
  }
}

// ── Export Notes ───────────────────────────────────────────────────────────
async function exportNotes(type) {
  const summaryText = document.getElementById('summary-output').innerText || '';
  const keyPointsNodes = document.querySelectorAll('#key-points-output li');
  const keyPoints = Array.from(keyPointsNodes)
    .map(li => li.innerText.replace(/^•\s*/, '').trim())
    .filter(t => t && t !== 'Key points will appear here…' && t !== 'No key points generated.');

  if (!summaryText || summaryText.includes('Your summary will appear here')) {
    showToast('No summary to export.', 'error');
    return;
  }

  showSpinner(`Generating ${type.toUpperCase()}...`, 'Exporting notes');
  try {
    const token = await getIdToken(); // from api.js
    const API_BASE = window.location.origin;
    const res = await fetch(`${API_BASE}/api/export/${type}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ summary: summaryText, key_points: keyPoints })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Export failed');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lecture_Summary.${type === 'text' ? 'txt' : 'pdf'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast(`${type.toUpperCase()} exported successfully!`, 'success');
  } catch (err) {
    showToast(`Error exporting: ${err.message}`, 'error');
  } finally {
    hideSpinner();
  }
}

// ── Visual Insights ──────────────────────────────────────────────────────────

let myChartInstance = null;

function switchVisualTab(tabId) {
  ['flowchart', 'graph'].forEach(id => {
    const btn = document.getElementById(`tab-${id}`);
    const content = document.getElementById(`visual-${id}`);
    if (btn && content) {
      if (id === tabId) {
        btn.classList.add('active');
        content.style.display = 'block';
      } else {
        btn.classList.remove('active');
        content.style.display = 'none';
      }
    }
  });
}

async function generateVisuals() {
  const summaryText = document.getElementById('summary-output').innerText || '';
  const keyPointsNodes = document.querySelectorAll('#key-points-output li');
  const keyPoints = Array.from(keyPointsNodes)
    .map(li => li.innerText.replace(/^•\s*/, '').trim())
    .filter(t => t && t !== 'Key points will appear here…' && t !== 'No key points generated.');

  if (!summaryText || summaryText.includes('Your summary will appear here')) {
    showToast('No summary available for visuals.', 'error');
    return;
  }

  showSpinner('Generating Visual Insights...', 'Analyzing content...');
  try {
    const token = await getIdToken();
    const API_BASE = window.location.origin;
    const res = await fetch(`${API_BASE}/api/visualize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ summary: summaryText, key_points: keyPoints })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to generate visuals');
    }

    const data = await res.json();
    document.getElementById('visual-insights-section').style.display = 'block';

    // Flowchart
    const fNode = document.getElementById('mermaid-flowchart');
    fNode.innerHTML = data.flowchart;
    fNode.removeAttribute('data-processed');

    // Render Mermaid diagrams
    if (typeof mermaid !== 'undefined') {
      try { mermaid.init(undefined, "#mermaid-flowchart"); } catch(e) {}
    }

    // Chart.js Graph
    if (typeof Chart !== 'undefined') {
      const gData = data.graph_data || { labels: [], values: [] };
      const ctx = document.getElementById('chart-canvas').getContext('2d');
      if (myChartInstance) myChartInstance.destroy();
      
      myChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: gData.labels,
          datasets: [{
            label: 'Keyword Frequency',
            data: gData.values,
            backgroundColor: 'rgba(108, 99, 255, 0.6)',
            borderColor: 'rgba(108, 99, 255, 1)',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#e8ecf4' } }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: '#8892aa', stepSize: 1 },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            x: {
              ticks: { color: '#8892aa' },
              grid: { display: false }
            }
          }
        }
      });
    }

    showToast('Visuals generated successfully!', 'success');
  } catch (err) {
    showToast(`Error generating visuals: ${err.message}`, 'error');
  } finally {
    hideSpinner();
  }
}

// ── Pure Speech-to-Text ──────────────────────────────────────────────────
async function handleTranscription() {
  const fileInput = document.getElementById('stt-file-input');
  const modelSelect = document.getElementById('stt-model-select');
  const file = fileInput.files[0];
  
  if (!file) {
    showToast('Please select a file to transcribe.', 'error');
    return;
  }
  
  const btn = document.getElementById('btn-stt');
  btn.disabled = true;
  document.getElementById('stt-result-container').style.display = 'none';
  document.getElementById('stt-transcript-output').innerHTML = '';

  showSpinner('Transcribing Audio...', `Using ${modelSelect.value} model. This may take longer for higher accuracy models.`);
  
  try {
    const token = await getIdToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', modelSelect.value);
    
    const API_BASE = window.location.origin;
    const res = await fetch(`${API_BASE}/api/transcribe`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Transcription failed');
    }
    
    const data = await res.json();
    
    // Show Output
    document.getElementById('stt-result-container').style.display = 'block';
    
    const langBadge = document.getElementById('stt-lang-badge');
    if (data.language) {
      langBadge.textContent = data.language.toUpperCase();
      langBadge.style.display = 'inline-flex';
    } else {
      langBadge.style.display = 'none';
    }
    
    // Format Optional Timestamps safely handling <br>
    const outputElem = document.getElementById('stt-transcript-output');
    if (data.segments && data.segments.length > 0) {
      let htmlContent = '';
      data.segments.forEach(seg => {
         const start = new Date(seg.start * 1000).toISOString().substring(14, 19);
         const end = new Date(seg.end * 1000).toISOString().substring(14, 19);
         // Filter potential HTML injections implicitly through basic sanitization
         const cleanText = seg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
         htmlContent += `<span style="color:var(--teal-light); font-weight:600; font-family:monospace; margin-right:8px;">[${start} - ${end}]</span> ${cleanText}<br>`;
      });
      outputElem.innerHTML = htmlContent;
    } else {
      outputElem.textContent = data.transcript;
    }
    
    showToast('Transcription successful!', 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    hideSpinner();
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  loadRecords();
});
