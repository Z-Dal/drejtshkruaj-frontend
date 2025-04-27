import React, { useState, useEffect } from 'react';
import { getUserTokenUsage } from '../../services/api';
import './TokenStatsWidget.css';

const TokenStatsWidget = ({ minimal = true }) => {
  const [tokenUsage, setTokenUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTokenUsage = async () => {
      try {
        setLoading(true);
        const usageData = await getUserTokenUsage();
        setTokenUsage(usageData);
        setError(null);
      } catch (err) {
        console.error('Error fetching token usage:', err);
        setError('Failed to load token data');
      } finally {
        setLoading(false);
      }
    };

    fetchTokenUsage();
    
    // Listen for token usage updates from API responses
    const handleTokenUsageUpdate = (event) => {
      console.log('TokenStatsWidget - Received token-usage-updated event:', event.detail);
      setTokenUsage(event.detail);
    };
    
    document.addEventListener('token-usage-updated', handleTokenUsageUpdate);
    
    // Refresh token usage every 5 minutes
    const intervalId = setInterval(fetchTokenUsage, 5 * 60 * 1000);
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('token-usage-updated', handleTokenUsageUpdate);
    };
  }, []);

  if (loading) {
    return <div className="token-widget-loading"></div>;
  }

  if (error || !tokenUsage) {
    return null;
  }

  const percentUsed = (tokenUsage.tokens_used_today / tokenUsage.daily_token_limit) * 100;
  const tokenStatus = percentUsed > 80 ? 'critical' : percentUsed > 50 ? 'low' : 'good';

  if (minimal) {
    return (
      <div className="token-widget-mini" title={`${Math.max(0, tokenUsage.remaining_tokens)} tokens remaining today`}>
        <div className="token-mini-progress">
          <div 
            className={`token-mini-bar ${tokenStatus}`} 
            style={{ width: `${Math.min(100, percentUsed)}%` }}
          ></div>
        </div>
        <span className="token-mini-count">{Math.max(0, tokenUsage.remaining_tokens)}</span>
      </div>
    );
  }

  return (
    <div className="token-widget">
      <div className="token-widget-header">
        <span>Token Usage</span>
      </div>
      <div className="token-widget-content">
        <div className="token-widget-data">
          <span>{Math.max(0, tokenUsage.remaining_tokens)} / {tokenUsage.daily_token_limit}</span>
        </div>
        <div className="token-widget-data">
          <span>Used today: {Math.min(Math.max(0, tokenUsage.tokens_used_today), tokenUsage.daily_token_limit)}</span>
        </div>
        <div className="token-progress">
          <div 
            className={`token-progress-bar ${tokenStatus}`} 
            style={{ width: `${Math.min(100, percentUsed)}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default TokenStatsWidget; 