import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('AgroPrice Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          fontFamily: 'sans-serif',
          padding: '2rem',
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '24px',
            padding: '2.5rem',
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: '#ef44441a', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.25rem',
              fontSize: '28px',
            }}>
              ⚠️
            </div>
            <h2 style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: 700, margin: '0 0 0.5rem' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
              AgroPrice ran into an unexpected error. Try refreshing the page.
            </p>
            {this.state.error && (
              <p style={{
                background: '#0f172a', borderRadius: '12px',
                padding: '0.75rem 1rem', color: '#ef4444',
                fontSize: '12px', fontFamily: 'monospace',
                textAlign: 'left', marginBottom: '1.5rem',
                wordBreak: 'break-word',
              }}>
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#10b981', color: '#fff',
                border: 'none', borderRadius: '12px',
                padding: '0.75rem 2rem', fontSize: '14px',
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
