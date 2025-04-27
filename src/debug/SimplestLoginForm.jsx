import React from 'react';

const SimplestLoginForm = () => {
  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ textAlign: 'center' }}>Basic Login Form</h1>
      <p style={{ textAlign: 'center', marginBottom: '20px' }}>This form submits directly to the backend without JavaScript.</p>
      
      <form 
        action="http://localhost:8000/auth/jwt/login" 
        method="post"
        encType="application/x-www-form-urlencoded"
        style={{ 
          border: '1px solid #ddd', 
          padding: '20px', 
          borderRadius: '8px',
          backgroundColor: '#f9f9f9' 
        }}
      >
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Email:
          </label>
          <input 
            type="email" 
            name="username" 
            required
            style={{ 
              width: '100%', 
              padding: '10px', 
              border: '1px solid #ccc', 
              borderRadius: '4px',
              boxSizing: 'border-box'
            }} 
          />
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Password:
          </label>
          <input 
            type="password" 
            name="password" 
            required 
            style={{ 
              width: '100%', 
              padding: '10px', 
              border: '1px solid #ccc', 
              borderRadius: '4px',
              boxSizing: 'border-box'
            }} 
          />
        </div>
        
        <input type="hidden" name="grant_type" value="password" />
        <input type="hidden" name="scope" value="" />
        
        <button 
          type="submit"
          style={{ 
            width: '100%',
            backgroundColor: '#4CAF50',
            color: 'white',
            padding: '12px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          Login
        </button>
      </form>
      
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <p>This is a fallback form with no JavaScript.</p>
        <p>It will redirect to a backend response page.</p>
      </div>
    </div>
  );
};

export default SimplestLoginForm; 