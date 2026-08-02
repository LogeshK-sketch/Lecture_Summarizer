import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../services/firebase';
import { signOut, sendPasswordResetEmail } from 'firebase/auth';
import {
  apiTranscribeFile,
  apiUploadDocument,
  apiTranscribeUrl,
  apiTranscribeText,
  apiSummarize,
  apiGetRecords,
  apiDeleteRecord,
  apiExportPdf,
  apiExportText,
  apiVisualize,
} from '../services/api';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Navigation & UI Panels
  const [activePanel, setActivePanel] = useState('home');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  // Modals
  const [openModal, setOpenModal] = useState(null); // 'settings', 'upload', 'document', 'text', 'url', 'record'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [recordActiveTab, setRecordActiveTab] = useState('transcript');

  // Settings state
  const [appSettings, setAppSettings] = useState(() => {
    const saved = localStorage.getItem('appSettings');
    return saved ? JSON.parse(saved) : { defaultLength: 'medium', transcriptionModel: 'base', autoSave: true };
  });

  // Action / State Parameters
  const [lengthSettings, setLengthSettings] = useState({
    upload: 'medium',
    document: 'medium',
    text: 'medium',
    url: 'medium',
    result: 'medium',
  });

  useEffect(() => {
    // Sync default summary lengths whenever appSettings.defaultLength changes
    setLengthSettings(prev => ({
      ...prev,
      upload: appSettings.defaultLength,
      document: appSettings.defaultLength,
      text: appSettings.defaultLength,
      url: appSettings.defaultLength,
      result: appSettings.defaultLength,
    }));
  }, [appSettings.defaultLength]);

  // Toast System
  const [toasts, setToasts] = useState([]);
  const showToast = (msg, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random().toString();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  };

  // Loading Overlay
  const [loading, setLoading] = useState({ active: false, label: '', step: '' });
  const showSpinner = (label, step = '') => setLoading({ active: true, label, step });
  const updateSpinner = (label, step = '') => setLoading(prev => ({ ...prev, label, step }));
  const hideSpinner = () => setLoading({ active: false, label: '', step: '' });

  // Input states
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [pastedText, setPastedText] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [sttFile, setSttFile] = useState(null);
  const [sttModel, setSttModel] = useState(appSettings.transcriptionModel);

  // Result output states
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [currentSummary, setCurrentSummary] = useState('');
  const [currentKeyPoints, setCurrentKeyPoints] = useState([]);
  const [currentSourceType, setCurrentSourceType] = useState('text');
  const [currentSourceName, setCurrentSourceName] = useState('');
  
  // STT pure output states
  const [sttTranscript, setSttTranscript] = useState('');
  const [sttLanguage, setSttLanguage] = useState('');
  const [sttSegments, setSttSegments] = useState([]);

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedAudioFile, setRecordedAudioFile] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const chunksRef = useRef([]);

  // Records state
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');

  // Visual Insights state
  const [showVisuals, setShowVisuals] = useState(false);
  const [visualTab, setVisualTab] = useState('flowchart'); // 'flowchart' | 'graph'
  const [flowchartCode, setFlowchartCode] = useState('');
  const [graphData, setGraphData] = useState(null);
  const chartInstance = useRef(null);

  // Theme synchronization
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  // Auth Protection
  useEffect(() => {
    if (!user) {
      navigate('/');
    }
  }, [user, navigate]);

  // Load records when switching to records panel
  useEffect(() => {
    if (activePanel === 'records') {
      loadRecords();
    }
  }, [activePanel]);

  // Render Keyword Chart (Chart.js)
  useEffect(() => {
    if (showVisuals && visualTab === 'graph' && graphData && window.Chart) {
      const ctx = document.getElementById('chart-canvas')?.getContext('2d');
      if (ctx) {
        if (chartInstance.current) {
          chartInstance.current.destroy();
        }
        chartInstance.current = new window.Chart(ctx, {
          type: 'bar',
          data: {
            labels: graphData.labels,
            datasets: [{
              label: 'Keyword Frequency',
              data: graphData.values,
              backgroundColor: 'rgba(108, 99, 255, 0.6)',
              borderColor: 'rgba(108, 99, 255, 1)',
              borderWidth: 1,
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { labels: { color: theme === 'light' ? '#000000' : '#e8ecf4' } }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { color: theme === 'light' ? '#333333' : '#8892aa', stepSize: 1 },
                grid: { color: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }
              },
              x: {
                ticks: { color: theme === 'light' ? '#333333' : '#8892aa' },
                grid: { display: false }
              }
            }
          }
        });
      }
    }
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [showVisuals, visualTab, graphData, theme]);

  // Render Mermaid diagrams
  useEffect(() => {
    if (showVisuals && visualTab === 'flowchart' && flowchartCode && window.mermaid) {
      const fNode = document.getElementById('mermaid-flowchart');
      if (fNode) {
        fNode.innerHTML = flowchartCode;
        fNode.removeAttribute('data-processed');
        try {
          window.mermaid.init(undefined, "#mermaid-flowchart");
        } catch (e) {
          console.error('Mermaid render error:', e);
        }
      }
    }
  }, [showVisuals, visualTab, flowchartCode]);

  // Timer helper for voice recording
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Your browser does not support microphone recording.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.addEventListener('dataavailable', (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      });

      mediaRecorder.addEventListener('stop', () => {
        const file = new File(chunksRef.current, 'voice_recording.webm', { type: 'audio/webm' });
        setRecordedAudioFile(file);
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
        }
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        setIsRecording(false);
      });

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      showToast(`Unable to start recording: ${err.message}`, 'error');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const submitVoiceRecording = async () => {
    if (!recordedAudioFile) return;
    showSpinner('Transcribing voice…', 'Uploading recording and transcribing');
    try {
      const transRes = await apiTranscribeFile(recordedAudioFile);
      setCurrentTranscript(transRes.transcript);
      setCurrentSourceType('voice');
      setCurrentSourceName('Voice recording');

      updateSpinner('Generating summary…', 'Extracting key points with LSA');
      const sumRes = await apiSummarize(
        transRes.transcript,
        lengthSettings.upload,
        'voice',
        'Voice recording'
      );
      setCurrentSummary(sumRes.summary);
      setCurrentKeyPoints(sumRes.key_points);
      setShowVisuals(false); // reset visuals section
      showToast('Voice transcription and summary complete!', 'success');
      // Scroll to results
      setTimeout(() => {
        document.getElementById('output-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      hideSpinner();
      setRecordedAudioFile(null);
    }
  };

  // Submit audio/video files
  const submitFileUpload = async () => {
    if (!selectedFile) return;
    setOpenModal(null);
    showSpinner('Transcribing audio…', 'This may take a while for large files');
    try {
      const transRes = await apiTranscribeFile(selectedFile);
      setCurrentTranscript(transRes.transcript);
      setCurrentSourceType('file');
      setCurrentSourceName(selectedFile.name);

      updateSpinner('Generating summary…', 'Extracting key points with LSA');
      const sumRes = await apiSummarize(
        transRes.transcript,
        lengthSettings.upload,
        'file',
        selectedFile.name
      );
      setCurrentSummary(sumRes.summary);
      setCurrentKeyPoints(sumRes.key_points);
      setShowVisuals(false);
      showToast('Done! Transcript and summary ready.', 'success');
      setTimeout(() => {
        document.getElementById('output-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      hideSpinner();
      setSelectedFile(null);
    }
  };

  // Submit documents
  const submitDocumentUpload = async () => {
    if (!selectedDocument) return;
    setOpenModal(null);
    showSpinner('Processing document…', 'Extracting text and generating summary');
    try {
      const docRes = await apiUploadDocument(selectedDocument, lengthSettings.document);
      setCurrentTranscript(docRes.transcript);
      setCurrentSourceType('file');
      setCurrentSourceName(docRes.file_name || selectedDocument.name);
      setCurrentSummary(docRes.summary);
      setCurrentKeyPoints(docRes.key_points);
      setShowVisuals(false);
      showToast('Document summarized successfully!', 'success');
      setTimeout(() => {
        document.getElementById('output-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      hideSpinner();
      setSelectedDocument(null);
    }
  };

  // Submit pasted text
  const submitPastedText = async () => {
    if (!pastedText.trim()) {
      showToast('Please paste some text first.', 'error');
      return;
    }
    // Detect URL check
    try {
      const url = new URL(pastedText.trim());
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        setOpenModal(null);
        setInputUrl(pastedText.trim());
        submitUrl(pastedText.trim());
        return;
      }
    } catch (e) {
      // not a url, regular text
    }

    setOpenModal(null);
    showSpinner('Processing text…', 'Running LSA summarization');
    try {
      const transRes = await apiTranscribeText(pastedText.trim());
      setCurrentTranscript(transRes.transcript);
      setCurrentSourceType('text');
      setCurrentSourceName('Pasted text');

      updateSpinner('Generating summary…', 'Extracting key points');
      const sumRes = await apiSummarize(
        transRes.transcript,
        lengthSettings.text,
        'text',
        'Pasted text'
      );
      setCurrentSummary(sumRes.summary);
      setCurrentKeyPoints(sumRes.key_points);
      setShowVisuals(false);
      showToast('Summary generated!', 'success');
      setTimeout(() => {
        document.getElementById('output-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      hideSpinner();
      setPastedText('');
    }
  };

  // Submit URL Transcribe
  const submitUrl = async (urlOverride) => {
    const targetUrl = urlOverride || inputUrl;
    if (!targetUrl.trim()) {
      showToast('Please enter a URL.', 'error');
      return;
    }
    setOpenModal(null);
    showSpinner('Downloading audio…', 'Fetching media from URL');
    try {
      const transRes = await apiTranscribeUrl(targetUrl.trim());
      setCurrentTranscript(transRes.transcript);
      setCurrentSourceType('url');
      setCurrentSourceName(targetUrl.trim());

      updateSpinner('Generating summary…', 'Extracting key points with LSA');
      const sumRes = await apiSummarize(
        transRes.transcript,
        lengthSettings.url,
        'url',
        targetUrl.trim()
      );
      setCurrentSummary(sumRes.summary);
      setCurrentKeyPoints(sumRes.key_points);
      setShowVisuals(false);
      showToast('Transcription and summary complete!', 'success');
      setTimeout(() => {
        document.getElementById('output-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      hideSpinner();
      setInputUrl('');
    }
  };

  // Re-summarize results
  const handleResummarize = async () => {
    if (!currentTranscript) return;
    showSpinner('Re-summarizing…', `Length: ${lengthSettings.result}`);
    try {
      const sumRes = await apiSummarize(
        currentTranscript,
        lengthSettings.result,
        currentSourceType,
        currentSourceName
      );
      setCurrentSummary(sumRes.summary);
      setCurrentKeyPoints(sumRes.key_points);
      showToast('Summary updated!', 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      hideSpinner();
    }
  };

  // Export options
  const handleExport = async (type) => {
    if (!currentSummary) {
      showToast('No summary to export.', 'error');
      return;
    }
    showSpinner(`Generating ${type.toUpperCase()}...`, 'Exporting notes');
    try {
      const blob = type === 'pdf' 
        ? await apiExportPdf(currentSummary, currentKeyPoints) 
        : await apiExportText(currentSummary, currentKeyPoints);
      
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
  };

  // Generate Visual Insights
  const handleGenerateVisuals = async () => {
    if (!currentSummary) {
      showToast('No summary available for visuals.', 'error');
      return;
    }
    showSpinner('Generating Visual Insights...', 'Analyzing content...');
    try {
      const data = await apiVisualize(currentSummary);
      setFlowchartCode(data.flowchart);
      setGraphData(data.graph_data);
      setShowVisuals(true);
      setVisualTab('flowchart');
      showToast('Visuals generated successfully!', 'success');
    } catch (err) {
      showToast(`Error generating visuals: ${err.message}`, 'error');
    } finally {
      hideSpinner();
    }
  };

  // Pure STT Transcription
  const handlePureTranscription = async () => {
    if (!sttFile) {
      showToast('Please select a file to transcribe.', 'error');
      return;
    }
    setSttTranscript('');
    setSttLanguage('');
    setSttSegments([]);
    
    showSpinner('Transcribing Audio...', `Using ${sttModel} model. This may take longer for higher accuracy models.`);
    try {
      // Overriding standard file submission with specific Whisper model
      const token = await auth.currentUser.getIdToken(false);
      const formData = new FormData();
      formData.append('file', sttFile);
      formData.append('model', sttModel);
      
      const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:10000' 
        : window.location.origin;

      const res = await fetch(`${BASE_URL}/api/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Transcription failed');
      }

      const data = await res.json();
      setSttTranscript(data.transcript);
      setSttLanguage(data.language || '');
      setSttSegments(data.segments || []);
      showToast('Transcription successful!', 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      hideSpinner();
      setSttFile(null);
      const fileInput = document.getElementById('stt-file-input');
      if (fileInput) fileInput.value = '';
    }
  };

  // Load Records
  const loadRecords = async () => {
    setRecordsLoading(true);
    setRecordsError('');
    try {
      const data = await apiGetRecords();
      setRecords(data.records || []);
    } catch (err) {
      setRecordsError(`Error loading records: ${err.message}`);
    } finally {
      setRecordsLoading(false);
    }
  };

  // Delete specific record
  const handleDeleteRecord = async (e, recordId) => {
    e.stopPropagation();
    if (!confirm('Delete this record?')) return;
    try {
      await apiDeleteRecord(recordId);
      showToast('Record deleted.', 'success');
      loadRecords();
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  };

  // Delete all user records
  const handleDeleteAllRecords = async () => {
    if (!confirm('Are you sure? This will permanently delete ALL your records.')) return;
    setOpenModal(null);
    showSpinner('Deleting records…', 'This may take a moment');
    try {
      await Promise.all(records.map(r => apiDeleteRecord(r.id)));
      showToast('All records deleted successfully.', 'success');
      setRecords([]);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      hideSpinner();
    }
  };

  const handleSendResetLink = async () => {
    if (!user || !user.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      showToast(`Password reset email sent to ${user.email}`, 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('appSettings', JSON.stringify(appSettings));
    showToast('Settings saved successfully!', 'success');
    setOpenModal(null);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (err) {
      showToast('Error signing out.', 'error');
    }
  };

  const copyText = (text) => {
    if (!text.trim()) return;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!', 'success', 2000);
    });
  };

  // Get initials for profile picture
  const getInitials = () => {
    if (!user) return '?';
    const name = user.displayName || user.email || '?';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <>
      {/* Toast container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="toast-icon">
              {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span className="toast-msg">{t.msg}</span>
          </div>
        ))}
      </div>

      {/* Loading Overlay */}
      {loading.active && (
        <div className="spinner-overlay visible">
          <div className="spinner"></div>
          <div className="spinner-text">
            <div>{loading.label}</div>
            <div className="spinner-step">{loading.step}</div>
          </div>
        </div>
      )}

      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="brand-icon">
              <svg viewBox="0 0 24 24" fill="white">
                <path d="M12 2a10 10 0 110 20A10 10 0 0112 2zm0 2a8 8 0 100 16A8 8 0 0012 4zm-1 4h2v5h-2V8zm0 7h2v2h-2v-2z" />
              </svg>
            </div>
            <span className="sidebar-logo-text">LectureMind</span>
          </div>

          <nav className="sidebar-nav">
            <div 
              className={`nav-item ${activePanel === 'home' ? 'active' : ''}`}
              onClick={() => setActivePanel('home')}
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Home
            </div>

            <div 
              className={`nav-item ${activePanel === 'records' ? 'active' : ''}`}
              onClick={() => setActivePanel('records')}
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              My Records
            </div>

            <div className="nav-divider"></div>

            <div className="nav-item" onClick={() => setOpenModal('upload')}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Upload Audio/Video
            </div>

            <div className="nav-item" onClick={() => setOpenModal('document')}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Upload Document
            </div>

            <div className="nav-item" onClick={() => setOpenModal('text')}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Paste Text
            </div>

            <div className="nav-item" onClick={() => setOpenModal('url')}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
              From URL
            </div>
          </nav>

          <div className="sidebar-footer">
            <div className="user-profile" onClick={() => setOpenModal('settings')} style={{ cursor: 'pointer' }} title="Open Settings">
              <div className="user-avatar">{getInitials()}</div>
              <div className="user-info">
                <div className="user-name">{user?.displayName || 'User'}</div>
                <div className="user-email">{user?.email || ''}</div>
              </div>
            </div>
            <div className="sidebar-footer-actions">
              <button className="btn-settings" onClick={() => setOpenModal('settings')} title="Settings" aria-label="Settings">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
              <button className="btn-logout" onClick={handleLogout}>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          <div className="main-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 className="greeting-text">
                Good <span>{new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</span>, {user?.displayName || 'there'}! 👋
              </h1>
              <p className="greeting-sub">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="theme-toggle-btn" 
                onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} 
                aria-label="Toggle light/dark mode" 
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '8px', borderRadius: '50%' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px' }}>
                  {theme === 'light' ? (
                    <>
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </>
                  ) : (
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  )}
                </svg>
              </button>
              <button 
                className="settings-btn" 
                onClick={() => setOpenModal('settings')} 
                aria-label="Settings" 
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px' }}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m3.08 3.08l4.24 4.24M1 12h6m6 0h6m-16.78 7.78l4.24-4.24m3.08-3.08l4.24-4.24" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Home Panel ── */}
          {activePanel === 'home' && (
            <div className="panel active">
              <div className="action-cards">
                {/* Upload Video/Audio */}
                <div className="action-card card-upload" onClick={() => setOpenModal('upload')} role="button" tabIndex={0}>
                  <div className="card-icon icon-upload">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                  </div>
                  <div>
                    <div className="card-label">Upload Video/Audio</div>
                    <div className="card-desc">MP4, MP3, WAV, M4A and more. Up to 200 MB.</div>
                  </div>
                  <div className="card-arrow">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Upload Document */}
                <div className="action-card card-document" onClick={() => setOpenModal('document')} role="button" tabIndex={0} style={{ background: 'linear-gradient(135deg, rgba(30,58,138,0.2) 0%, rgba(30,58,138,0.05) 100%)' }}>
                  <div className="card-icon icon-document" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <div className="card-label">Upload Document</div>
                    <div className="card-desc">PDF, Word, or PowerPoint files.</div>
                  </div>
                  <div className="card-arrow">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Paste Text */}
                <div className="action-card card-text" onClick={() => setOpenModal('text')} role="button" tabIndex={0}>
                  <div className="card-icon icon-text">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="card-label">Paste Text</div>
                    <div className="card-desc">Paste lecture notes or a transcript and get a summary.</div>
                  </div>
                  <div className="card-arrow">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* From URL */}
                <div className="action-card card-url" onClick={() => setOpenModal('url')} role="button" tabIndex={0}>
                  <div className="card-icon icon-url">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22.54 6.42A2.78 2.78 0 0020.83 4.72C19.25 4.28 12 4.28 12 4.28s-7.25 0-8.83.44A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.17 19.28C4.75 19.72 12 19.72 12 19.72s7.25 0 8.83-.44a2.78 2.78 0 001.71-1.7A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
                    </svg>
                  </div>
                  <div>
                    <div className="card-label">Transcribe from URL</div>
                    <div className="card-desc">YouTube link or video URL — auto-downloaded.</div>
                  </div>
                  <div className="card-arrow">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Speech to Text Section */}
              <div className="stt-section" style={{ marginBottom: '36px' }}>
                <div className="panel-title">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  Speech to Text
                </div>
                <div className="output-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label className="form-label" htmlFor="stt-file-input">Upload Audio/Video file:</label>
                    <input 
                      type="file" 
                      id="stt-file-input" 
                      accept=".mp3,.mp4,.wav,.m4a,.ogg,.webm,.flac,.mpeg" 
                      style={{ width: '100%', padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                      onChange={(e) => setSttFile(e.target.files[0])}
                    />
                  </div>

                  <div className="record-controls" style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                    <button 
                      className="btn-primary" 
                      style={{ minWidth: '170px' }}
                      disabled={isRecording}
                      onClick={startVoiceRecording}
                    >
                      Start Voice Recording
                    </button>
                    <button 
                      className="btn-ghost" 
                      style={{ minWidth: '140px' }}
                      disabled={!isRecording}
                      onClick={stopVoiceRecording}
                    >
                      Stop Recording
                    </button>
                    <span style={{ color: isRecording ? 'var(--accent)' : 'var(--text-muted)', fontSize: '0.92rem' }}>
                      {isRecording ? `Recording... ${formatTime(recordingTime)}` : recordedAudioFile ? `Recording complete — ${formatTime(recordingTime)}` : 'Ready to record.'}
                    </span>
                  </div>

                  {recordedAudioFile && (
                    <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button 
                        className="btn-primary" 
                        style={{ minWidth: '220px' }}
                        onClick={submitVoiceRecording}
                      >
                        Transcribe &amp; Summarize Recording
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="form-label" htmlFor="stt-model-select">Select model:</label>
                    <select 
                      id="stt-model-select" 
                      style={{ width: '100%', padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                      value={sttModel}
                      onChange={(e) => setSttModel(e.target.value)}
                    >
                      <option value="base">Base (Fastest)</option>
                      <option value="small">Small</option>
                      <option value="medium">Medium (Most Accurate)</option>
                    </select>
                  </div>

                  <button className="btn-primary" style={{ marginTop: '8px' }} onClick={handlePureTranscription} disabled={!sttFile}>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px', display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '6px' }}>
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" x2="12" y1="19" y2="22" />
                      <line x1="8" x2="16" y1="22" y2="22" />
                    </svg>
                    Transcribe Audio
                  </button>
                </div>

                {/* Pure STT Output container */}
                {sttTranscript && (
                  <div className="output-box stt-result-box" style={{ display: 'block', marginTop: '20px', borderColor: 'rgba(0, 212, 170, 0.4)' }}>
                    <div className="output-box-header" style={{ background: 'linear-gradient(90deg, rgba(0, 212, 170, 0.1), transparent)' }}>
                      <div className="output-box-title" style={{ color: 'var(--teal-light)' }}>
                        Transcription Output
                        {sttLanguage && <span className="record-badge badge-text" style={{ marginLeft: '12px' }}>{sttLanguage.toUpperCase()}</span>}
                      </div>
                      <div className="output-box-actions">
                        <button className="btn-copy" onClick={() => copyText(sttTranscript)}>Copy</button>
                      </div>
                    </div>
                    <div className="output-box-body" style={{ maxHeight: '400px' }}>
                      <div className="output-text" style={{ lineHeight: '2.0' }}>
                        {sttSegments.length > 0 ? (
                          sttSegments.map((seg, i) => {
                            const start = new Date(seg.start * 1000).toISOString().substring(14, 19);
                            const end = new Date(seg.end * 1000).toISOString().substring(14, 19);
                            return (
                              <div key={i} style={{ marginBottom: '6px' }}>
                                <span style={{ color: 'var(--teal-light)', fontWeight: 600, fontFamily: 'monospace', marginRight: '8px' }}>
                                  [{start} - {end}]
                                </span>
                                {seg.text}
                              </div>
                            );
                          })
                        ) : (
                          sttTranscript
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Main Results Output Section */}
              {currentTranscript && (
                <div className="output-section visible" id="output-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div className="panel-title" style={{ marginBottom: 0 }}>
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      Results
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="length-label">Adjust summary:</span>
                      {['short', 'medium', 'long'].map(l => (
                        <button 
                          key={l}
                          className={`length-btn ${lengthSettings.result === l ? 'active' : ''}`}
                          onClick={() => setLengthSettings(prev => ({ ...prev, result: l }))}
                        >
                          {l.charAt(0).toUpperCase() + l.slice(1)}
                        </button>
                      ))}
                      <button className="btn-summarize" onClick={handleResummarize}>
                        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" />
                          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                        </svg>
                        Re-summarize
                      </button>
                    </div>
                  </div>

                  <div className="output-grid">
                    {/* Transcript */}
                    <div className="output-box">
                      <div className="output-box-header">
                        <div className="output-box-title">
                          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77" />
                          </svg>
                          Transcript
                        </div>
                        <div className="output-box-actions">
                          <button className="btn-copy" onClick={() => copyText(currentTranscript)}>Copy</button>
                        </div>
                      </div>
                      <div className="output-box-body">
                        <p className="output-text">{currentTranscript}</p>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="output-box summary-box">
                      <div className="output-box-header">
                        <div className="output-box-title">
                          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                          AI Summary
                        </div>
                        <div className="output-box-actions">
                          <button className="btn-copy" onClick={() => copyText(currentSummary)}>Copy</button>
                        </div>
                      </div>
                      <div className="output-box-body">
                        <p className="output-text">{currentSummary}</p>
                      </div>
                    </div>

                    {/* Key Points */}
                    <div className="output-box summary-box" style={{ gridColumn: '1 / -1' }}>
                      <div className="output-box-header">
                        <div className="output-box-title">
                          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 6h16M4 12h16M4 18h16M8 6H8.01M8 12H8.01M8 18H8.01" />
                          </svg>
                          Key Points
                        </div>
                        <div className="output-box-actions">
                          <button className="btn-copy" onClick={() => copyText(currentKeyPoints.join('\n'))}>Copy</button>
                        </div>
                      </div>
                      <div className="output-box-body">
                        <ul className="output-text" style={{ marginLeft: 0, listStyleType: 'none', padding: 0 }}>
                          {currentKeyPoints.length > 0 ? (
                            currentKeyPoints.map((pt, i) => (
                              <li key={i} style={{ marginBottom: '8px', position: 'relative', paddingLeft: '14px' }}>
                                <span style={{ position: 'absolute', left: 0, color: 'var(--accent)' }}>•</span>
                                {pt}
                              </li>
                            ))
                          ) : (
                            <li className="output-placeholder">No key points generated.</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="export-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button className="btn-primary" onClick={() => handleExport('pdf')} style={{ width: 'auto', padding: '10px 20px' }}>
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px', display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '6px' }}>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <polyline points="9 15 12 18 15 15" />
                      </svg>
                      Download PDF
                    </button>
                    <button className="btn-primary" onClick={() => handleExport('text')} style={{ width: 'auto', padding: '10px 20px', background: 'linear-gradient(135deg, var(--teal), #00bcd4)' }}>
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px', display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '6px' }}>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      Download TXT
                    </button>
                  </div>

                  <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <button className="btn-primary" onClick={handleGenerateVisuals} style={{ width: 'auto', padding: '10px 24px', background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)' }}>
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px', display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '6px' }}>
                        <path d="M3 3v18h18" />
                        <path d="M18 17V9" />
                        <path d="M13 17V5" />
                        <path d="M8 17v-3" />
                      </svg>
                      Generate Visual Insights
                    </button>
                  </div>

                  {showVisuals && (
                    <div className="visual-insights" style={{ display: 'block', marginTop: '28px' }}>
                      <div className="panel-title" style={{ marginBottom: '12px' }}>
                        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                        Visual Insights
                      </div>
                      
                      <div className="length-selector" style={{ marginBottom: 0 }}>
                        <button className={`length-btn ${visualTab === 'flowchart' ? 'active' : ''}`} onClick={() => setVisualTab('flowchart')}>Flowchart</button>
                        <button className={`length-btn ${visualTab === 'graph' ? 'active' : ''}`} onClick={() => setVisualTab('graph')}>Keyword Graph</button>
                      </div>

                      <div className="output-box" style={{ marginTop: '16px', borderColor: 'rgba(167, 139, 250, 0.4)' }}>
                        <div className="output-box-body" style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', overflow: 'auto' }}>
                          <div id="visual-flowchart" className="visual-content" style={{ width: '100%', display: visualTab === 'flowchart' ? 'block' : 'none' }}>
                            <div className="mermaid" id="mermaid-flowchart"></div>
                          </div>

                          <div id="visual-graph" className="visual-content" style={{ width: '100%', display: visualTab === 'graph' ? 'block' : 'none', maxWidth: '600px', margin: '0 auto', paddingTop: '10px' }}>
                            <canvas id="chart-canvas"></canvas>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── My Records Panel ── */}
          {activePanel === 'records' && (
            <div className="panel active">
              <div className="panel-title">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                My Records
              </div>
              <div className="records-container">
                {recordsLoading ? (
                  <div className="records-empty" style={{ gridColumn: '1/-1' }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
                    Loading records…
                  </div>
                ) : recordsError ? (
                  <div className="records-empty" style={{ gridColumn: '1/-1' }}>
                    {recordsError}
                  </div>
                ) : records.length === 0 ? (
                  <div className="records-empty">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    No records yet. Start by transcribing something!
                  </div>
                ) : (
                  <div className="records-grid">
                    {records.slice().sort((a, b) => {
                      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                      return bTime - aTime;
                    }).map(r => {
                      const badgeClass = { file: 'badge-file', text: 'badge-text', url: 'badge-url', voice: 'badge-voice' }[r.source_type] || 'badge-text';
                      const badgeLabel = { file: '📁 File', text: '✏️ Text', url: '🔗 URL', voice: '🎙️ Voice' }[r.source_type] || r.source_type;
                      const date = r.created_at ? new Date(r.created_at).toLocaleString() : '';
                      const preview = (r.summary || '').slice(0, 200);

                      return (
                        <div key={r.id} className="record-card" onClick={() => { setSelectedRecord(r); setRecordActiveTab('transcript'); setOpenModal('record'); }}>
                          <div className="record-card-header">
                            <span className={`record-badge ${badgeClass}`}>{badgeLabel}</span>
                            <span className="record-meta">
                              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {date}
                            </span>
                          </div>
                          <p className="record-summary">{preview}{r.summary && r.summary.length > 200 ? '…' : ''}</p>
                          <div className="record-card-footer">
                            <span className="record-length-badge">{r.summary_length || 'medium'} summary</span>
                            <button className="btn-delete-record" onClick={(e) => handleDeleteRecord(e, r.id)} title="Delete">
                              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
           MODALS RENDER
           ═══════════════════════════════════════════════════════════════════════ */}

      {/* Settings Modal */}
      {openModal === 'settings' && (
        <div className="modal-overlay open" onClick={() => setOpenModal(null)}>
          <div className="modal modal-settings-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <div className="modal-title">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                <span>Settings</span>
              </div>
              <button className="modal-close" onClick={() => setOpenModal(null)}>✕</button>
            </div>
            <div className="modal-body settings-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              
              {/* Appearance */}
              <div className="settings-section">
                <div className="settings-section-title">Theme</div>
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Theme</span>
                    <span className="settings-hint">Switch between dark and light mode</span>
                  </div>
                  <label className="settings-toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={theme === 'light'} 
                      onChange={(e) => setTheme(e.target.checked ? 'light' : 'dark')}
                    />
                    <span className="settings-toggle-track">
                      <span className="settings-toggle-thumb"></span>
                    </span>
                    <span className="settings-toggle-label">{theme === 'light' ? 'Light' : 'Dark'}</span>
                  </label>
                </div>
              </div>

              {/* Summarization Defaults */}
              <div className="settings-section">
                <div className="settings-section-title">Summarization Defaults</div>
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Default summary length</span>
                  </div>
                  <div className="settings-btn-group">
                    {['short', 'medium', 'long'].map(l => (
                      <button 
                        key={l}
                        className={`settings-opt-btn ${appSettings.defaultLength === l ? 'active' : ''}`}
                        onClick={() => setAppSettings(prev => ({ ...prev, defaultLength: l }))}
                      >
                        {l.charAt(0).toUpperCase() + l.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Transcription */}
              <div className="settings-section">
                <div className="settings-section-title">Transcription</div>
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Default Whisper model</span>
                  </div>
                  <select 
                    className="settings-select"
                    value={appSettings.transcriptionModel}
                    onChange={(e) => setAppSettings(prev => ({ ...prev, transcriptionModel: e.target.value }))}
                  >
                    <option value="tiny">Tiny (fastest)</option>
                    <option value="base">Base (balanced)</option>
                    <option value="small">Small (accurate)</option>
                    <option value="medium">Medium (best)</option>
                  </select>
                </div>
              </div>

              {/* Account */}
              <div className="settings-section">
                <div className="settings-section-title">Account</div>
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Display name</span>
                    <span className="settings-hint">{user?.displayName || 'Not set'}</span>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Email</span>
                    <span className="settings-hint">{user?.email || 'Not set'}</span>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Password</span>
                    <span className="settings-hint">Send a reset link to your email</span>
                  </div>
                  <button className="settings-action-btn" onClick={handleSendResetLink}>Send Reset Link</button>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="settings-section settings-danger">
                <div className="settings-section-title" style={{ color: '#ef4444' }}>Danger Zone</div>
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Delete all my records</span>
                    <span className="settings-hint">This action is permanent and cannot be undone.</span>
                  </div>
                  <button className="settings-action-btn settings-action-danger" onClick={handleDeleteAllRecords}>Delete All</button>
                </div>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setOpenModal(null)}>Close</button>
              <button className="btn-submit" onClick={handleSaveSettings}>Save Settings</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload File Modal */}
      {openModal === 'upload' && (
        <div className="modal-overlay open" onClick={() => setOpenModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <div className="modal-title">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <span>Upload Audio / Video</span>
              </div>
              <button className="modal-close" onClick={() => setOpenModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div 
                className="upload-drop-zone"
                onClick={() => document.getElementById('file-input-modal').click()}
              >
                <div className="upload-drop-icon">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4M10 10l2-2 2 2M12 8v5" />
                  </svg>
                </div>
                <div className="upload-drop-title">
                  {selectedFile ? `📎 ${selectedFile.name}` : 'Click to select audio or video file'}
                </div>
                <div className="upload-drop-sub">mp3, mp4, wav, m4a, ogg, webm, flac — up to 200 MB</div>
              </div>
              <input 
                type="file" 
                id="file-input-modal" 
                accept=".mp3,.mp4,.wav,.m4a,.ogg,.webm,.flac,.mpeg"
                style={{ display: 'none' }} 
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />

              <div className="length-selector" style={{ marginTop: '18px' }}>
                <span className="length-label">Summary length:</span>
                {['short', 'medium', 'long'].map(l => (
                  <button 
                    key={l}
                    className={`length-btn ${lengthSettings.upload === l ? 'active' : ''}`}
                    onClick={() => setLengthSettings(prev => ({ ...prev, upload: l }))}
                  >
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setOpenModal(null)}>Cancel</button>
              <button className="btn-submit" disabled={!selectedFile} onClick={submitFileUpload}>
                Transcribe &amp; Summarize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {openModal === 'document' && (
        <div className="modal-overlay open" onClick={() => setOpenModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <div className="modal-title">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>Upload Document</span>
              </div>
              <button className="modal-close" onClick={() => setOpenModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div 
                className="upload-drop-zone"
                onClick={() => document.getElementById('doc-input-modal').click()}
              >
                <div className="upload-drop-icon">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="upload-drop-title">
                  {selectedDocument ? `📄 ${selectedDocument.name}` : 'Click to select document file'}
                </div>
                <div className="upload-drop-sub">PDF, DOCX, PPTX supported</div>
              </div>
              <input 
                type="file" 
                id="doc-input-modal" 
                accept=".pdf,.docx,.pptx"
                style={{ display: 'none' }} 
                onChange={(e) => setSelectedDocument(e.target.files[0])}
              />

              <div className="length-selector" style={{ marginTop: '18px' }}>
                <span className="length-label">Summary length:</span>
                {['short', 'medium', 'long'].map(l => (
                  <button 
                    key={l}
                    className={`length-btn ${lengthSettings.document === l ? 'active' : ''}`}
                    onClick={() => setLengthSettings(prev => ({ ...prev, document: l }))}
                  >
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setOpenModal(null)}>Cancel</button>
              <button className="btn-submit" disabled={!selectedDocument} onClick={submitDocumentUpload}>
                Upload &amp; Summarize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Text Modal */}
      {openModal === 'text' && (
        <div className="modal-overlay open" onClick={() => setOpenModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <div className="modal-title">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span>Paste Lecture Text</span>
              </div>
              <button className="modal-close" onClick={() => setOpenModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <textarea 
                className="modal-textarea" 
                placeholder="Paste or type your lecture transcript here…"
                rows="8"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
              />

              <div className="length-selector">
                <span className="length-label">Summary length:</span>
                {['short', 'medium', 'long'].map(l => (
                  <button 
                    key={l}
                    className={`length-btn ${lengthSettings.text === l ? 'active' : ''}`}
                    onClick={() => setLengthSettings(prev => ({ ...prev, text: l }))}
                  >
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setOpenModal(null)}>Cancel</button>
              <button className="btn-submit" onClick={submitPastedText}>
                Summarize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* URL Modal */}
      {openModal === 'url' && (
        <div className="modal-overlay open" onClick={() => setOpenModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <div className="modal-title">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                </svg>
                <span>Transcribe from URL</span>
              </div>
              <button className="modal-close" onClick={() => setOpenModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label" htmlFor="url-input">YouTube or Video URL</label>
                <input 
                  className="form-input" 
                  id="url-input" 
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=…" 
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                />
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Supports YouTube, Vimeo, and other yt-dlp compatible URLs.
                </p>
              </div>

              <div className="length-selector">
                <span className="length-label">Summary length:</span>
                {['short', 'medium', 'long'].map(l => (
                  <button 
                    key={l}
                    className={`length-btn ${lengthSettings.url === l ? 'active' : ''}`}
                    onClick={() => setLengthSettings(prev => ({ ...prev, url: l }))}
                  >
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setOpenModal(null)}>Cancel</button>
              <button className="btn-submit" onClick={() => submitUrl()}>
                Transcribe &amp; Summarize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Detail Modal */}
      {openModal === 'record' && selectedRecord && (
        <div className="modal-overlay open" onClick={() => setOpenModal(null)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <div>
                <div className="modal-title" id="modal-record-title">
                  {selectedRecord.source_name ? `Record: ${selectedRecord.source_name}` : 'Record Detail'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {selectedRecord.source_type.toUpperCase()} • {selectedRecord.created_at ? new Date(selectedRecord.created_at).toLocaleString() : ''}
                </div>
              </div>
              <button className="modal-close" onClick={() => setOpenModal(null)}>✕</button>
            </div>

            <div className="record-tabs">
              <button className={`tab-btn ${recordActiveTab === 'transcript' ? 'active' : ''}`} onClick={() => setRecordActiveTab('transcript')}>Transcript</button>
              <button className={`tab-btn ${recordActiveTab === 'summary' ? 'active' : ''}`} onClick={() => setRecordActiveTab('summary')}>Summary</button>
              <button className={`tab-btn ${recordActiveTab === 'points' ? 'active' : ''}`} onClick={() => setRecordActiveTab('points')}>Key Points</button>
            </div>

            <div className="modal-body">
              {recordActiveTab === 'transcript' && (
                <div className="record-tab-content active">
                  <div className="tab-header">
                    <span>Transcript</span>
                    <button className="btn-copy" onClick={() => copyText(selectedRecord.transcript)}>Copy</button>
                  </div>
                  <div className="tab-body">
                    <p style={{ whiteSpace: 'pre-wrap' }}>{selectedRecord.transcript || 'No transcript available'}</p>
                  </div>
                </div>
              )}

              {recordActiveTab === 'summary' && (
                <div className="record-tab-content active">
                  <div className="tab-header">
                    <span>Summary</span>
                    <button className="btn-copy" onClick={() => copyText(selectedRecord.summary)}>Copy</button>
                  </div>
                  <div className="tab-body">
                    <p style={{ whiteSpace: 'pre-wrap' }}>{selectedRecord.summary || 'No summary available'}</p>
                  </div>
                </div>
              )}

              {recordActiveTab === 'points' && (
                <div className="record-tab-content active">
                  <div className="tab-header">
                    <span>Key Points</span>
                    <button className="btn-copy" onClick={() => copyText((selectedRecord.key_points || []).join('\n'))}>Copy</button>
                  </div>
                  <div className="tab-body">
                    <ul style={{ listStyleType: 'none', padding: 0 }}>
                      {selectedRecord.key_points && selectedRecord.key_points.length > 0 ? (
                        selectedRecord.key_points.map((pt, i) => (
                          <li key={i} style={{ marginBottom: '8px', position: 'relative', paddingLeft: '14px' }}>
                            <span style={{ position: 'absolute', left: 0, color: 'var(--accent)' }}>•</span>
                            {pt}
                          </li>
                        ))
                      ) : (
                        <li className="output-placeholder">No key points available.</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setOpenModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
