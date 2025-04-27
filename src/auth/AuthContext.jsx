import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const checkAuth = async () => {
    try {
      console.log('Checking authentication status...');
      console.log('Current cookies:', document.cookie);
      
      // Check if there's a stored token in localStorage
      const storedToken = localStorage.getItem('drejtshkruaj_auth_token');
      console.log('Stored token exists:', !!storedToken);
      
      // Prepare headers
      const headers = {};
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }
      
      const response = await fetch('http://localhost:8000/users/me', {
        credentials: 'include',
        headers
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('Authentication successful, user data:', userData);
        setUser(userData);
        return true;
      } else {
        console.warn('Authentication check failed with status:', response.status);
        // If unauthorized, clear any stale token
        if (response.status === 401) {
          localStorage.removeItem('drejtshkruaj_auth_token');
        }
        return false;
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check authentication when the app loads
    checkAuth();
    
    // Add an event listener to check auth on focus (when returning to the tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAuth();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Clean up the event listener
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const login = async (username, password) => {
    try {
      console.log('Login attempt started for:', username);
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      formData.append('grant_type', 'password');
      formData.append('scope', '');
      
      console.log('Sending login request to backend...');
      const response = await fetch('http://localhost:8000/auth/jwt/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
        credentials: 'include',
      });

      console.log('Login response received:', {
        status: response.status, 
        statusText: response.statusText,
        ok: response.ok
      });

      // Check for unauthorized first
      if (response.status === 401) {
        console.log('Login failed: Unauthorized (401) - returning false');
        return false;
      }
      
      // Then check for success
      if (response.ok) {
        // Log cookies for debugging
        console.log('Cookies after login:', document.cookie);
        
        // Try to get the token from the response
        try {
          const data = await response.json();
          if (data && data.access_token) {
            console.log('Received access token, storing for API calls');
            localStorage.setItem('drejtshkruaj_auth_token', data.access_token);
          }
        } catch (e) {
          console.log('No JSON response with token');
        }
        
        console.log('Checking authentication after successful login...');
        const success = await checkAuth();
        console.log('checkAuth result:', success);
        if (success) {
          console.log('Authentication successful, navigating to home');
          navigate('/');
          return true;
        } else {
          console.log('checkAuth failed after successful login response');
        }
      }
      
      // For other error responses, try to parse error details if available
      try {
        const errorData = await response.json();
        console.error('Login error details:', errorData);
      } catch (e) {
        console.error('Login failed with status:', response.status);
      }
      
      console.log('Login failed, returning false');
      return false;
    } catch (error) {
      console.error('Login exception:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      // Get the stored token if it exists
      const storedToken = localStorage.getItem('drejtshkruaj_auth_token');
      
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }
      
      const response = await fetch('http://localhost:8000/auth/jwt/logout', {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      
      // Clear the stored token regardless of the response
      localStorage.removeItem('drejtshkruaj_auth_token');
      
      if (response.ok) {
        console.log('Logout successful');
      } else {
        console.warn('Logout response not OK:', response.status);
      }
      
      // Always clear the user state and redirect
      setUser(null);
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Still clear the user state and token on error
      localStorage.removeItem('drejtshkruaj_auth_token');
      setUser(null);
      navigate('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 