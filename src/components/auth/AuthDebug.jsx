import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext';

const AuthDebug = () => {
  const { user, loading } = useAuth();
  const [apiResponse, setApiResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkApiStatus = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8000/users/me', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const responseText = await response.text();
      
      // Try to parse as JSON
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = responseText;
      }
      
      setApiResponse({
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        data: responseData,
        headers: Object.fromEntries([...response.headers.entries()]),
        cookies: document.cookie
      });
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    checkApiStatus();
  }, []);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'monospace' }}>
      <h1 style={{ textAlign: 'center' }}>Authentication Debug</h1>
      
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h2>AuthContext State:</h2>
        <div>
          <p><strong>Loading:</strong> {loading ? 'true' : 'false'}</p>
          <p><strong>User:</strong> {user ? 'Authenticated' : 'Not authenticated'}</p>
          {user && (
            <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', overflowX: 'auto' }}>
              {JSON.stringify(user, null, 2)}
            </pre>
          )}
        </div>
      </div>
      
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h2>API Status:</h2>
        <button 
          onClick={checkApiStatus} 
          disabled={isLoading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#007BFF',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            marginBottom: '10px'
          }}
        >
          {isLoading ? 'Checking...' : 'Recheck API Status'}
        </button>
        
        {error && (
          <div style={{ color: 'red', marginBottom: '10px' }}>
            {error}
          </div>
        )}
        
        {apiResponse && (
          <div>
            <p><strong>Status:</strong> {apiResponse.status} {apiResponse.statusText}</p>
            <p><strong>Response:</strong></p>
            <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', overflowX: 'auto' }}>
              {JSON.stringify(apiResponse.data, null, 2)}
            </pre>
            
            <p><strong>Headers:</strong></p>
            <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', overflowX: 'auto' }}>
              {JSON.stringify(apiResponse.headers, null, 2)}
            </pre>
            
            <p><strong>Cookies:</strong></p>
            <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', overflowX: 'auto' }}>
              {apiResponse.cookies || 'No cookies'}
            </pre>
          </div>
        )}
      </div>
      
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h2>Local Storage:</h2>
        <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', overflowX: 'auto' }}>
          {localStorage.getItem('drejtshkruaj_auth_token') 
            ? `drejtshkruaj_auth_token: ${localStorage.getItem('drejtshkruaj_auth_token')}` 
            : 'No auth token found in localStorage'}
        </pre>
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <a href="/login" style={{ margin: '0 10px', color: '#007BFF', textDecoration: 'none' }}>Go to Login</a>
        <a href="/login-test" style={{ margin: '0 10px', color: '#007BFF', textDecoration: 'none' }}>Go to Login Test</a>
        <a href="/login-simple" style={{ margin: '0 10px', color: '#007BFF', textDecoration: 'none' }}>Go to Simple Login</a>
        <a href="/" style={{ margin: '0 10px', color: '#007BFF', textDecoration: 'none' }}>Go to Home</a>
      </div>
    </div>
  );
};

export default AuthDebug; 