import React, { useState } from 'react';

const LoginTest = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const testLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult('Testing login...');

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      formData.append('grant_type', 'password');
      formData.append('scope', '');
      
      const startTime = Date.now();
      const response = await fetch('http://localhost:8000/auth/jwt/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
        credentials: 'include',
      });
      const endTime = Date.now();
      
      // Get all response headers as a string
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      // Try to get response body
      let responseBody = null;
      try {
        responseBody = await response.text();
        if (responseBody && responseBody.length > 0) {
          try {
            responseBody = JSON.parse(responseBody);
          } catch (e) {
            // Keep as text if not valid JSON
          }
        }
      } catch (e) {
        responseBody = `Error reading body: ${e.message}`;
      }
      
      const resultObj = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        time: `${endTime - startTime}ms`,
        headers: headers,
        body: responseBody,
        cookies: document.cookie
      };
      
      setResult(JSON.stringify(resultObj, null, 2));
    } catch (err) {
      setResult(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Login API Test</h2>
      <form onSubmit={testLogin} style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Email:</label>
          <input 
            type="text" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            style={{ width: '100%', padding: '8px' }} 
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Password:</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={{ width: '100%', padding: '8px' }} 
          />
        </div>
        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            padding: '10px 15px', 
            background: '#4CAF50', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: loading ? 'not-allowed' : 'pointer' 
          }}
        >
          {loading ? 'Testing...' : 'Test Login'}
        </button>
      </form>
      
      <div>
        <h3>Result:</h3>
        <pre 
          style={{ 
            background: '#f5f5f5', 
            padding: '15px', 
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '400px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {result}
        </pre>
      </div>
    </div>
  );
};

export default LoginTest; 