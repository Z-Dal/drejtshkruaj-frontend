import React, { useState } from 'react';

function DirectLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      formData.append('grant_type', 'password');
      formData.append('scope', '');

      const response = await fetch('http://localhost:8000/auth/jwt/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
        credentials: 'include',
      });

      if (response.ok) {
        window.location.href = '/';
      } else {
        if (response.status === 401) {
          setErrorMessage('Incorrect username or password');
        } else if (response.status === 400) {
          try {
            // Try to parse response body for more details
            const errorData = await response.json();
            
            if (errorData.detail) {
              if (errorData.detail === 'LOGIN_BAD_CREDENTIALS') {
                setErrorMessage('Incorrect username or password');
              } else if (Array.isArray(errorData.detail)) {
                // Handle structured validation errors
                setErrorMessage(errorData.detail.map(err => err.msg || err).join(', '));
              } else {
                // Handle string error message
                setErrorMessage(errorData.detail);
              }
            } else {
              setErrorMessage('Invalid form submission. Please check your inputs.');
            }
          } catch (e) {
            // If can't parse JSON, use generic message
            setErrorMessage('Bad request. Please check your inputs.');
          }
        } else {
          setErrorMessage(`Login failed (Status ${response.status})`);
        }
      }
    } catch (error) {
      setErrorMessage('Network error. Please try again.');
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '40px',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
        transition: 'all 0.3s ease'
      }}>
        <h1 style={{ 
          textAlign: 'center', 
          marginBottom: '10px', 
          fontSize: '28px', 
          fontWeight: '600',
          color: '#333'
        }}>Welcome to Drejtshkruaj</h1>
        
        <p style={{ 
          textAlign: 'center', 
          color: '#666', 
          marginBottom: '30px',
          fontSize: '16px'
        }}>Please sign in to continue</p>

        {/* Error message as plain text */}
        {errorMessage && (
          <p style={{
            color: '#d32f2f',
            marginBottom: '20px',
            textAlign: 'center',
            fontWeight: '500',
            fontSize: '14px'
          }}>
            {errorMessage}
          </p>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontWeight: '500',
              fontSize: '14px',
              color: '#555'
            }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #e1e1e1',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
                outline: 'none'
              }}
              required
              disabled={isLoading}
              placeholder="your@email.com"
            />
          </div>

          <div style={{ marginBottom: '30px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontWeight: '500',
              fontSize: '14px',
              color: '#555'
            }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #e1e1e1',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
                outline: 'none'
              }}
              required
              disabled={isLoading}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#4361ee',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
              transition: 'background-color 0.2s',
              boxShadow: '0 2px 10px rgba(67, 97, 238, 0.3)'
            }}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default DirectLogin; 