import { useState, useRef, useEffect } from 'react';
import EditableTable from '../components/EditableTable';

const STATUS = {
  IDLE: 'idle',
  PREVIEW: 'preview',
  UPLOADING: 'uploading',
  READY: 'ready',
  ERROR: 'error'
};


export default function Home() {
  const [session, setSession] = useState(null);
  const [usage, setUsage] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [userFirstName, setUserFirstName] = useState('');

  const [status, setStatus] = useState(STATUS.IDLE);
  const [table, setTable] = useState(null);
  const [conversionId, setConversionId] = useState(null);
  const [filename, setFilename] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [useEnhance, setUseEnhance] = useState(false);
  const [activeBox, setActiveBox] = useState(null);
  const [headerRows, setHeaderRows] = useState(1);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  // Check Local Storage for session
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedFirstName = localStorage.getItem('firstName');
    if (token) {
      setSession(token);
      setUserFirstName(storedFirstName || 'User');
      fetchUsage(token);
    }
  }, []);

  const fetchUsage = async (token) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user/usage`, {
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

  const handleAuth = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin 
        ? { email, password } 
        : { firstName, lastName, email, password };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('firstName', data.firstName || '');
        setSession(data.token);
        setUserFirstName(data.firstName || '');
        fetchUsage(data.token);
      } else {
        setErrorMsg(data.error || 'Authentication failed.');
      }
    } catch (err) {
      setErrorMsg('Network error. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('firstName');
    setSession(null);
    setUsage(null);
    reset();
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    setErrorMsg('');
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStatus(STATUS.PREVIEW);
  };

  const handleStartConversion = async () => {
    if (!selectedFile) return;
    setStatus(STATUS.UPLOADING);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('image', selectedFile);
    if (useEnhance) {
      formData.append('enhance', 'true');
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/convert`, {
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
      setFilename(data.filename);
      setHeaderRows(data.table.headerRowCount || 1);
      setStatus(STATUS.READY);
      fetchUsage(session);
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      setStatus(STATUS.ERROR);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFileSelect(e.dataTransfer.files?.[0]);
  };

  const handleDownload = async (format) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/convert/${conversionId}/export`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session}`
      },
      body: JSON.stringify({ table, format }) // Added format parameter
    });

    if (!res.ok) {
      setErrorMsg(`Could not generate the ${format.toUpperCase()} file. Please try again.`);
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Choose correct extension based on format
    let ext = 'xlsx';
    if (format === 'csv') ext = 'csv';
    else if (format === 'pdf') ext = 'pdf';
    a.download = `extracted.${ext}`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStatus(STATUS.IDLE);
    setTable(null);
    setConversionId(null);
    setFilename(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUseEnhance(false);
    setActiveBox(null);
    setErrorMsg('');
  };

  useEffect(() => {
    if (status !== STATUS.READY || !imgRef.current || !canvasRef.current || !activeBox) return;
    // Draw bounding box
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imgRef.current;
    
    canvas.width = img.width;
    canvas.height = img.height;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // activeBox is [ymin, xmin, ymax, xmax] scaled 0-1000
    const x = (activeBox.xmin / 1000) * img.width;
    const y = (activeBox.ymin / 1000) * img.height;
    const w = ((activeBox.xmax - activeBox.xmin) / 1000) * img.width;
    const h = ((activeBox.ymax - activeBox.ymin) / 1000) * img.height;
    
    ctx.strokeStyle = '#10B981'; // var(--primary)
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.fillRect(x, y, w, h);
    
    // Zoom logic if it's very low confidence or handwriting
    // Could manually set a transform on the image, but simple scrolling might be enough for now.
  }, [activeBox, status]);

  if (!session) {
    return (
      <div className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="auth-container">
          <div className="eyebrow" style={{justifyContent: 'center', marginBottom: '16px'}}>Img2Excel</div>
          <h2>{isLogin ? 'Log in to continue' : 'Create an account'}</h2>
          <p style={{color: 'var(--ink-soft)', marginBottom: '24px'}}>Convert images to editable spreadsheets in seconds.</p>
          
          {errorMsg && <div className="error-box" style={{margin: '0 0 20px'}}>{errorMsg}</div>}

          <form onSubmit={handleAuth}>
            {!isLogin && (
              <div style={{display: 'flex', gap: '8px'}}>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="First Name" 
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Last Name" 
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            )}
            <input 
              type="email" 
              className="input-field" 
              placeholder="Email Address" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input 
              type="password" 
              className="input-field" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" style={{width: '100%', marginBottom: '16px'}}>
              {isLogin ? 'Log In' : 'Sign Up'}
            </button>
          </form>
          <div style={{ textAlign: 'center', fontSize: '13px' }}>
            <span style={{color: 'var(--ink-soft)'}}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <span 
              onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }} 
              style={{cursor: 'pointer', color: 'var(--primary)', fontWeight: '500'}}
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {usage && (
        <div className="user-nav">
          <span>{userFirstName}</span>
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
        <div className="upload-container">
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
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
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

          <div style={{ textAlign: 'center', margin: '20px 0' }}>
            <span style={{ color: 'var(--ink-soft)' }}>— or —</span>
          </div>

          <label className="btn btn-secondary" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            Take Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}

      {status === STATUS.PREVIEW && (
        <div className="preview-setup">
          <h2>Enhance & Confirm</h2>
          <img 
            src={previewUrl} 
            alt="Preview" 
            style={{ filter: useEnhance ? 'contrast(120%) grayscale(100%)' : 'none' }}
          />
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
              <input 
                type="checkbox" 
                checked={useEnhance} 
                onChange={(e) => setUseEnhance(e.target.checked)} 
                style={{ width: '18px', height: '18px' }}
              />
              Auto-Enhance Image (B&W + Contrast)
            </label>
          </div>
          <div className="actions-row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={reset}>Cancel</button>
            <button className="btn btn-primary" onClick={handleStartConversion}>Convert to Excel</button>
          </div>
        </div>
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
            <div>
              <div className="preview-title">Review your data</div>
              <div className="preview-hint">Click any cell to fix mistakes before downloading</div>
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                Header Rows: 
                <select 
                  value={headerRows} 
                  onChange={(e) => setHeaderRows(Number(e.target.value))}
                  style={{ marginLeft: '8px', padding: '4px 8px', borderRadius: '4px' }}
                >
                  {[0,1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
          </div>

          {table.warning && <div className="error-box">{table.warning}</div>}

          <div className="split-view-container">
            <div className="image-viewer">
              {filename && (
                <>
                  <img 
                    ref={imgRef}
                    src={`${process.env.NEXT_PUBLIC_BASE_URL}/uploads/${filename}`} 
                    alt="Original Uploaded Table" 
                  />
                  <canvas ref={canvasRef} className="image-viewer-canvas" />
                </>
              )}
            </div>
            
            <div className="table-panel">
              <EditableTable 
                table={table} 
                onChange={setTable} 
                onFocusCell={setActiveBox}
              />
            </div>
          </div>

          <div className="actions-row">
            <button className="btn btn-primary" onClick={() => handleDownload('xlsx')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Excel
            </button>
            <button className="btn btn-primary" onClick={() => handleDownload('csv')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              CSV
            </button>
            <button className="btn btn-primary" onClick={() => handleDownload('pdf')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              PDF
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

