import React, { useState, useEffect } from 'react';
import { getUserTokenUsage } from '../../services/api';
import './TokenStatsWidget.css';
import UserProfile from './UserProfile';

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
    const radius = 24;
    const stroke = 4;
    const normalizedRadius = radius - stroke / 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const percent = Math.min(100, percentUsed);
    const progress = circumference - (percent / 100) * circumference;

    return (
      <div className="token-widget-circular">
        <svg
          height={radius * 2}
          width={radius * 2}
          className="token-circular-progress"
        >
          <circle
            stroke="#e0e0e0"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          <circle
            stroke={
              tokenStatus === 'critical'
                ? '#f44336'
                : tokenStatus === 'low'
                ? '#ff9800'
                : '#4caf50'
            }
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            strokeDashoffset={progress}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            style={{ transition: 'stroke-dashoffset 0.5s' }}
          />
        </svg>
        <div className="token-circular-avatar">
          <UserProfile minimal={true} />
        </div>
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