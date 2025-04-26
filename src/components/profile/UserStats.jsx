import React, { useState, useEffect } from 'react';
import { getUserTokenUsage, getUserSubscription } from '../../services/api';
import './UserStats.css';

const UserStats = () => {
  const [tokenUsage, setTokenUsage] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        setLoading(true);
        const [usageData, subscriptionData] = await Promise.all([
          getUserTokenUsage(),
          getUserSubscription()
        ]);
        
        setTokenUsage(usageData);
        setSubscription(subscriptionData);
        setError(null);
      } catch (err) {
        console.error('Error fetching user stats:', err);
        setError('Failed to load user statistics. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserStats();
  }, []);

  if (loading) {
    return <div className="user-stats-loading">Loading your statistics...</div>;
  }

  if (error) {
    return <div className="user-stats-error">{error}</div>;
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <div className="user-stats-container">
      <div className="stats-card token-usage">
        <h3>Token Usage</h3>
        {tokenUsage && (
          <div className="stats-content">
            <div className="stats-item">
              <span>Daily Limit:</span>
              <span className="stats-value">{tokenUsage.daily_token_limit}</span>
            </div>
            <div className="stats-item">
              <span>Used Today:</span>
              <span className="stats-value">{tokenUsage.tokens_used_today}</span>
            </div>
            <div className="stats-item">
              <span>Remaining:</span>
              <span className="stats-value">{tokenUsage.remaining_tokens}</span>
            </div>
            <div className="token-progress-container">
              <div 
                className="token-progress-bar" 
                style={{ 
                  width: `${Math.min(100, (tokenUsage.tokens_used_today / tokenUsage.daily_token_limit) * 100)}%` 
                }}
              ></div>
            </div>
          </div>
        )}
      </div>

      <div className="stats-card subscription">
        <h3>Subscription</h3>
        {subscription && (
          <div className="stats-content">
            <div className="stats-item">
              <span>Plan:</span>
              <span className="stats-value">{subscription.plan.name}</span>
            </div>
            <div className="stats-item">
              <span>Status:</span>
              <span className={`stats-value status-${subscription.status}`}>
                {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
              </span>
            </div>
            <div className="stats-item">
              <span>Expires:</span>
              <span className="stats-value">{formatDate(subscription.end_date)}</span>
            </div>
            <div className="stats-item">
              <span>Days Left:</span>
              <span className="stats-value">{subscription.days_remaining}</span>
            </div>
            <div className="stats-item">
              <span>Auto-Renew:</span>
              <span className="stats-value">{subscription.auto_renew ? 'Yes' : 'No'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserStats; 