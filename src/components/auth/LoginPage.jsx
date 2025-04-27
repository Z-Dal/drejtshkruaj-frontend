import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import './LoginPage.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setError('');
    
    // Create form data
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    formData.append('grant_type', 'password');
    formData.append('scope', '');
    
    try {
      // Direct API call
      const response = await fetch('http://localhost:8000/auth/jwt/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
        credentials: 'include',
      });
      
      if (response.ok) {
        // Success! Call the context login function
        await login(email, password);
        navigate('/');
      } else {
        // Error handling
        if (response.status === 401 || response.status === 403) {
          setError('Incorrect username or password');
        } else if (response.status === 400) {
          try {
            const errorData = await response.json();
            if (errorData.detail === 'LOGIN_BAD_CREDENTIALS') {
              setError('Incorrect username or password');
            } else {
              setError(errorData.detail || `Login failed (Status ${response.status})`);
            }
          } catch (e) {
            setError(`Login failed (Status ${response.status})`);
          }
        } else {
          setError(`Login failed (Status ${response.status})`);
        }
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="left-column">
          <h1 className="app-logo">drejt<span>shkruaj</span></h1>
          <p className="app-tagline">Shkrimi i saktë në shqip, një klikim larg.</p>
          
          <div className="poem-container">
            <p>
              Përmbi zâ qi lshon bylbyli<br/>
              Gjûha shqype m'shungullon;<br/>
              Permbi érë qi nep zymbyli<br/>
              Pá da zêmren m'a ngushllon.<br/>
              <br/>
              Geg' e Toskë, malci, jallija<br/>
              Jân nji kômb, m'u da s'duron:<br/>
              Fund e maje nji â Shqypnija,<br/>
              E nji gjuhë t'gjith na bashkon.<br/>
              <b>- Gjergj Fishta, "Lahuta e Malcís"</b>
            </p>
          </div>
        </div>
        
        <div className="login-box">
          <div className="login-header">
            <h1>Welcome to Drejtshkruaj</h1>
            <p>Korrigjimi i tekstit në shqip</p>
          </div>
          
          {/* Always show error container, just hide it when empty */}
          <div 
            style={{
              display: error ? 'block' : 'none',
              backgroundColor: '#ffdddd', 
              color: '#d8000c',
              padding: '10px 15px',
              margin: '0 0 20px 0',
              borderRadius: '4px',
              border: '1px solid #d8000c',
              fontWeight: 'bold',
              textAlign: 'center'
            }}
          >
            {error}
          </div>
          
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email or phone number"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                disabled={isSubmitting}
              />
            </div>
            <button 
              type="submit" 
              className="login-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Logging In...' : 'Log In'}
            </button>
            
            <div className="forgot-password">
              <a href="#">Forgot password?</a>
            </div>
            
            <div className="divider"></div>
            
            <button
              type="button"
              className="create-account-button"
              onClick={() => navigate('/register')}
            >
              Create new account
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage; 