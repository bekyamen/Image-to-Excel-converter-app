import { useState, useRef, useEffect } from 'react';
import EditableTable from '../components/EditableTable';

const STATUS = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  READY: 'ready',
  ERROR: 'error'
};

export default function Home() {
  const [session, setSession] = useState(null);
  const [usage, setUsage] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  const [status, setStatus] = useState(STATUS.IDLE);
  const [table, setTable] = useState(null);
  const [conversionId, setConversionId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Check Local Storage for session
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setSession(token);
      fetchUsage(token);
    }
  }, []);

  const fetchUsage = async (token) => {
    try {
      const res = await fetch('http://localhost:4000/api/user/usage', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      } else {
        localStorage.removeItem('token');
        setSession(null);
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch('http://localhost:4000/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
      if (res.ok) {
        setOtpSent(true);
      } else {
        const data = await res.json();
        setErrorMsg(data.error);
      }
    } catch (err) {
      setErrorMsg('Failed to send OTP.');
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch('http://localhost:4000/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, code: otpCode })
      });
      
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        setSession(data.token);
        fetchUsage(data.token);
      } else {
        setErrorMsg(data.error);
      }
    } catch (err) {
      setErrorMsg('Failed to verify OTP.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setSession(null);
    setUsage(null);
    reset();
  };

  const handleFile = async (file) => {
    if (!file) return;
    setStatus(STATUS.UPLOADING);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('http://localhost:4000/api/convert', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session}`
        },
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Conversion failed.');
      }

      setTable(data.table);
      setConversionId(data.conversionId);
      setStatus(STATUS.READY);
      fetchUsage(session); // Update usage count
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      setStatus(STATUS.ERROR);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const handleDownload = async () => {
    const res = await fetch(`http://localhost:4000/api/convert/${conversionId}/export`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session}`
      },
      body: JSON.stringify({ table })
    });

    if (!res.ok) {
      setErrorMsg('Could not generate the Excel file. Please try again.');
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStatus(STATUS.IDLE);
    setTable(null);
    setConversionId(null);
    setErrorMsg('');
  };

  if (!session) {
    return (
      <div className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="auth-container">
          <div className="eyebrow" style={{justifyContent: 'center', marginBottom: '16px'}}>Img2Excel</div>
          <h2>Log in to continue</h2>
          <p style={{color: 'var(--ink-soft)', marginBottom: '24px'}}>Convert images to editable spreadsheets in seconds.</p>
          
          {errorMsg && <div className="error-box" style={{margin: '0 0 20px'}}>{errorMsg}</div>}

          {!otpSent ? (
            <form onSubmit={handleSendOTP}>
              <input 
                type="tel" 
                className="input-field" 
                placeholder="Phone Number (e.g. +251...)" 
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary" style={{width: '100%'}}>Continue with Phone</button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Enter 6-digit code (use 123456)" 
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary" style={{width: '100%'}}>Verify Code</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {usage && (
        <div className="user-nav">
          <span>{phoneNumber}</span>
          <span className="badge">
            {usage.plan === 'free' ? `${usage.remaining} free left` : 'Pro'}
          </span>
          <span style={{cursor: 'pointer', color: 'var(--ink-soft)', textDecoration: 'underline', fontSize: '12px'}} onClick={handleLogout}>Log out</span>
        </div>
      )}

      <div className="eyebrow">Photo to spreadsheet</div>
      <h1>Turn a table screenshot into Excel</h1>
      <p className="subtitle">
        Upload a photo of a price list, receipt, or any table. Review and fix
        the extracted data, then download it as a ready-to-use spreadsheet.
      </p>

      {status !== STATUS.READY && (
        <label
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
          <div className="dropzone-label">
            {status === STATUS.UPLOADING ? 'Reading your image…' : 'Click or drop an image here'}
          </div>
          <div className="dropzone-hint">JPG or PNG · works best with a clear, straight-on photo</div>
        </label>
      )}

      {status === STATUS.UPLOADING && (
        <div className="status-row">
          <div className="spinner" />
          Extracting table structure and data...
        </div>
      )}

      {status === STATUS.ERROR && (
        <div className="error-box">{errorMsg}</div>
      )}

      {status === STATUS.READY && table && (
        <div className="preview-section">
          <div className="preview-header">
            <div className="preview-title">Review your data</div>
            <div className="preview-hint">Click any cell to fix mistakes before downloading</div>
          </div>

          {table.warning && <div className="error-box">{table.warning}</div>}

          <EditableTable table={table} onChange={setTable} />

          <div className="actions-row">
            <button className="btn btn-primary" onClick={handleDownload}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download Excel
            </button>
            <button className="btn btn-secondary" onClick={reset}>
              Convert another
            </button>
          </div>
        </div>
      )}

      <div className="footer-note">
        Images are securely processed and immediately deleted. We don't store your data.
      </div>
    </div>
  );
}
