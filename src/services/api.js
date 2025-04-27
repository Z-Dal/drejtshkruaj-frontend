// API Service for Drejtshkruaj
const API_URL = 'http://localhost:8000';

// Cache for token usage data
let cachedTokenUsage = null;

/**
 * Updates the token usage based on TST from API responses
 * @param {number} tst - Tokens spent today (total) from API response
 */
export const updateTokenUsageFromResponse = (tst) => {
  // Add debugging logs
  console.log('Updating token usage with TST:', tst);
  console.log('TST type:', typeof tst);
  console.log('TST value parsed:', Number(tst));
  console.log('Cached token usage before update:', cachedTokenUsage);
  
  if (!cachedTokenUsage) {
    console.warn('No cached token usage data available');
    return;
  }
  
  // Ensure tst is a number
  const numTST = Number(tst);
  if (isNaN(numTST)) {
    console.warn('Invalid TST value:', tst);
    return;
  }
  
  // Make a copy of the cached data to avoid reference issues
  const updatedUsage = { ...cachedTokenUsage };
  
  // Update tokens_used_today with TST, ensuring it doesn't exceed daily limit
  updatedUsage.tokens_used_today = Math.min(numTST, updatedUsage.daily_token_limit);
  
  // Calculate remaining tokens, ensuring it doesn't go below 0
  updatedUsage.remaining_tokens = Math.max(0, updatedUsage.daily_token_limit - updatedUsage.tokens_used_today);
  
  // Update the cache with the new values
  cachedTokenUsage = updatedUsage;
  
  console.log('Cached token usage after update:', cachedTokenUsage);
  
  // Dispatch an event to notify components about the updated token usage
  const event = new CustomEvent('token-usage-updated', { 
    detail: { ...cachedTokenUsage } 
  });
  document.dispatchEvent(event);
  console.log('Token usage updated event dispatched');
};

/**
 * Helper function to prepare request headers with authentication
 * @returns {Object} Headers object with auth token if available
 */
const getAuthHeaders = (additionalHeaders = {}) => {
  const headers = {
    'Accept': 'application/json',
    ...additionalHeaders
  };
  
  const authToken = localStorage.getItem('drejtshkruaj_auth_token');
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  return headers;
};

/**
 * Handle unauthorized responses
 * @param {Response} response - The fetch response object
 */
const handleUnauthorized = (response) => {
  if (response.status === 401) {
    console.warn('Authentication failed. Redirecting to login...');
    // Clear token if unauthorized
    localStorage.removeItem('drejtshkruaj_auth_token');
    // Redirect to login page
    window.location.href = '/login';
    return true;
  }
  return false;
};

/**
 * Fetches user token usage information
 * @returns {Promise<Object>} Object containing daily_token_limit, tokens_used_today, and remaining_tokens
 */
export const getUserTokenUsage = async () => {
  try {
    const response = await fetch(`${API_URL}/user-data/usage`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    // Handle unauthorized response
    if (handleUnauthorized(response)) {
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      throw new Error(`Error fetching token usage: ${response.status}`);
    }

    const data = await response.json();
    console.log('Fetched token usage data:', data);
    
    // Cache the token usage data
    cachedTokenUsage = data;
    
    return data;
  } catch (error) {
    console.error('Failed to fetch token usage:', error);
    throw error;
  }
};

/**
 * Returns the cached token usage without making an API call
 * @returns {Object|null} Cached token usage data or null if not available
 */
export const getCachedTokenUsage = () => {
  return cachedTokenUsage;
};

/**
 * Fetches user subscription information
 * @returns {Promise<Object>} Subscription details including plan, status, and dates
 */
export const getUserSubscription = async () => {
  try {
    const response = await fetch(`${API_URL}/user-data/subscription`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    // Handle unauthorized response
    if (handleUnauthorized(response)) {
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      throw new Error(`Error fetching subscription: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch subscription data:', error);
    throw error;
  }
}; 