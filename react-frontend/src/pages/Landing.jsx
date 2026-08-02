import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../services/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('login');
  
  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup Form States
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const firebaseErrorMessage = (code) => {
    const map = {
      'auth/user-not-found':       'No account found with this email.',
      'auth/wrong-password':       'Incorrect password. Please try again.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password':        'Password is too weak. Use at least 6 characters.',
      'auth/invalid-email':        'Please enter a valid email address.',
      'auth/too-many-requests':    'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/invalid-credential':   'Invalid email or password.',
    };
    return map[code] || 'An error occurred. Please try again.';
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!loginEmail || !loginPassword) {
      setLoginError('Please fill in all fields.');
      return;
    }
    setLoginLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      navigate('/dashboard');
    } catch (err) {
      setLoginError(firebaseErrorMessage(err.code));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setSignupError('');
    if (!signupName || !signupEmail || !signupPassword) {
      setSignupError('Please fill in all fields.');
      return;
    }
    if (signupPassword.length < 6) {
      setSignupError('Password must be at least 6 characters.');
      return;
    }
    setSignupLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
      await updateProfile(cred.user, { displayName: signupName });
      navigate('/dashboard');
    } catch (err) {
      setSignupError(firebaseErrorMessage(err.code));
    } finally {
      setSignupLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoginError('');
    setSignupError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate('/dashboard');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        const errorMsg = firebaseErrorMessage(err.code);
        if (activeTab === 'login') {
          setLoginError(errorMsg);
        } else {
          setSignupError(errorMsg);
        }
      }
    }
  };

  const renderGoogleButton = () => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-secondary)' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
        <span style={{ padding: '0 10px', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
      </div>

      <button 
        type="button" 
        className="btn-primary" 
        style={{ 
          background: 'rgba(255,255,255,0.04)', 
          border: '1px solid var(--border)', 
          color: 'var(--text-primary)', 
          marginTop: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
        onClick={handleGoogleSignIn}
      >
        <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: 'currentColor' }}>
          <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.12 1 1.16 5.928 1.16 12s4.96 11 11.08 11c6.39 0 10.646-4.477 10.646-10.86 0-.737-.08-1.3-.175-1.855H12.24z"/>
        </svg>
        Continue with Google
      </button>
    </>
  );

  return (
    <div className="auth-page">
      <div className="auth-wrapper">
        {/* Left branding panel */}
        <div className="auth-brand">
          <div className="brand-logo">
            <div className="brand-icon">
              <svg viewBox="0 0 24 24">
                <path d="M12 2a10 10 0 110 20A10 10 0 0112 2zm0 2a8 8 0 100 16A8 8 0 0012 4zm-1 4h2v5h-2V8zm0 7h2v2h-2v-2z" />
              </svg>
            </div>
            <span className="brand-name">LectureMind</span>
          </div>

          <h1 className="brand-tagline">
            Transform lectures into<br />
            <span>instant insights</span>
          </h1>
          <p className="brand-desc">
            Upload a video, paste a URL, or type your text — LectureMind transcribes and summarizes it in seconds using advanced AI.
          </p>

          <div className="brand-features">
            <div className="brand-feature">
              <div className="brand-feature-dot"></div>
              <span>Whisper AI transcription</span>
            </div>
            <div className="brand-feature">
              <div className="brand-feature-dot"></div>
              <span>LSA-powered key point extraction</span>
            </div>
            <div className="brand-feature">
              <div className="brand-feature-dot"></div>
              <span>YouTube & video file support</span>
            </div>
            <div className="brand-feature">
              <div className="brand-feature-dot"></div>
              <span>All records saved to your account</span>
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="auth-form-panel">
          <div className="auth-tabs">
            <button 
              className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`} 
              onClick={() => setActiveTab('login')}
            >
              Sign In
            </button>
            <button 
              className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`} 
              onClick={() => setActiveTab('signup')}
            >
              Create Account
            </button>
          </div>

          {/* Login Section */}
          {activeTab === 'login' && (
            <div className="auth-section active">
              <h2 className="auth-title">Welcome back 👋</h2>
              <p className="auth-subtitle">Sign in to access your lecture summaries.</p>

              {loginError && <div className="auth-error-msg visible">{loginError}</div>}

              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label" htmlFor="login-email">Email</label>
                  <input 
                    className="form-input" 
                    id="login-email" 
                    type="email"
                    placeholder="you@example.com" 
                    required 
                    autoComplete="email" 
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="login-password">Password</label>
                  <input 
                    className="form-input" 
                    id="login-password" 
                    type="password"
                    placeholder="••••••••" 
                    required 
                    autoComplete="current-password" 
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                <button className="btn-primary" type="submit" disabled={loginLoading}>
                  {loginLoading ? 'Please wait…' : 'Sign In'}
                </button>
              </form>
              {renderGoogleButton()}
            </div>
          )}

          {/* Signup Section */}
          {activeTab === 'signup' && (
            <div className="auth-section active">
              <h2 className="auth-title">Create an account</h2>
              <p className="auth-subtitle">Join LectureMind and start summarizing today.</p>

              {signupError && <div className="auth-error-msg visible">{signupError}</div>}

              <form onSubmit={handleSignup}>
                <div className="form-group">
                  <label className="form-label" htmlFor="signup-name">Full Name</label>
                  <input 
                    className="form-input" 
                    id="signup-name" 
                    type="text"
                    placeholder="Jane Smith" 
                    required 
                    autoComplete="name" 
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="signup-email">Email</label>
                  <input 
                    className="form-input" 
                    id="signup-email" 
                    type="email"
                    placeholder="you@example.com" 
                    required 
                    autoComplete="email" 
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="signup-password">Password</label>
                  <input 
                    className="form-input" 
                    id="signup-password" 
                    type="password"
                    placeholder="At least 6 characters" 
                    required 
                    autoComplete="new-password" 
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                  />
                </div>
                <button className="btn-primary" type="submit" disabled={signupLoading}>
                  {signupLoading ? 'Please wait…' : 'Create Account'}
                </button>
              </form>
              {renderGoogleButton()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
