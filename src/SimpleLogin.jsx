import React, { useState } from 'react';

function SimpleLogin() {
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
        // On successful login, redirect to home
        window.location.href = '/';
      } else {
        // Handle error and show error message
        if (response.status === 401 || response.status === 403) {
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
      console.error('Login error:', error);
      setErrorMessage('Network error. Please try again.');
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
      background: '#f0f2f5',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '980px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '40px',
        padding: '20px'
      }}>
        {/* Left Column */}
        <div style={{
          flex: '1.2',
          paddingRight: '40px'
        }}>
          <h1 style={{ 
            color: '#1877f2',
            fontSize: '4rem',
            fontWeight: 'bold',
            marginBottom: '16px',
            fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            textAlign: 'left'
          }}>
            drejt<span style={{ 
              color: '#f44336', 
              textDecoration: 'underline',
              textDecorationColor: '#f44336'
            }}>shkruaj</span>
          </h1>
          
          <p style={{ 
            fontSize: '28px',
            fontWeight: 'normal',
            color: '#1c1e21',
            marginBottom: '32px',
            lineHeight: '1.3'
          }}>
            Shruaj shqip dhe pa gabime
          </p>
          
          {/* Albanian Poem */}
          <div style={{
            marginTop: '32px',
            padding: '24px',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            borderRadius: '8px',
            borderLeft: '4px solid #f44336',
            fontStyle: 'italic',
            color: '#333',
            lineHeight: '1.6',
            maxWidth: '90%'
          }}>
            <p style={{ margin: 0, fontSize: '16px' }}>
              Përmbi zâ qi lshon bylbyli<br/>
              Gjûha shqype m'shungullon;<br/>
              Permbi érë qi nep zymbyli<br/>
              Pá da zêmren m'a ngushllon.<br/>
              <br/>
              Geg' e Toskë, malci, jallija<br/>
              Jân nji kômb, m'u da s'duron:<br/>
              Fund e maje nji â Shqypnija,<br/>
              E nji gjuhë t'gjith na bashkon.<br/>
              <span style={{
                display: 'block',
                marginTop: '8px',
                fontStyle: 'normal',
                color: '#1877f2',
                fontSize: '14px',
                textAlign: 'right',
                fontWeight: 'bold'
              }}>
                - Gjergj Fishta, "Lahuta e Malcís"
              </span>
            </p>
          </div>
        </div>
        
        {/* Right Column - Login Box */}
        <div style={{
          flex: '1',
          background: 'white',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.1)',
          maxWidth: '400px',
          width: '100%'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <p style={{ 
              margin: 0,
              color: '#606770',
              fontSize: '18px'
            }}>
              Korrigjimi i tekstit në shqip
            </p>
          </div>
          
          {/* Error message */}
          {errorMessage && (
            <div style={{
              backgroundColor: '#ffdddd', 
              color: '#d8000c',
              padding: '10px 15px',
              margin: '0 0 20px 0',
              borderRadius: '4px',
              border: '1px solid #d8000c',
              fontWeight: 'bold',
              textAlign: 'center',
              fontSize: '14px'
            }}>
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleLogin}>
            {/* Email Field */}
            <div style={{ marginBottom: '16px' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  border: '1px solid #dddfe2',
                  borderRadius: '6px',
                  fontSize: '17px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
                required
                disabled={isLoading}
                placeholder="Email or phone number"
              />
            </div>

            {/* Password Field */}
            <div style={{ marginBottom: '16px' }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  border: '1px solid #dddfe2',
                  borderRadius: '6px',
                  fontSize: '17px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
                required
                disabled={isLoading}
                placeholder="Password"
              />
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: '#1877f2',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '20px',
                fontWeight: '600',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                marginTop: '8px'
              }}
            >
              {isLoading ? 'Logging In...' : 'Log In'}
            </button>
            
            {/* Forgot Password Link */}
            <div style={{ 
              textAlign: 'center', 
              margin: '16px 0'
            }}>
              <a 
                href="#" 
                style={{ 
                  color: '#1877f2',
                  fontSize: '14px', 
                  textDecoration: 'none'
                }}
              >
                Forgot password?
              </a>
            </div>
            
            {/* Divider */}
            <div style={{ 
              borderBottom: '1px solid #dadde1',
              margin: '20px 0'
            }}></div>
            
            {/* Create Account Button */}
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                style={{
                  backgroundColor: '#42b72a',
                  color: 'white',
                  border: 'none',
                  padding: '14px 16px',
                  borderRadius: '6px',
                  fontSize: '17px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-block'
                }}
                onClick={() => window.location.href = '/register'}
              >
                Create new account
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default SimpleLogin; 