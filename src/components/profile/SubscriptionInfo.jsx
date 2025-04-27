import React, { useState, useEffect } from 'react';
import { getUserSubscription, getUserTokenUsage } from '../../services/api';
import './SubscriptionInfo.css';

const SubscriptionInfo = () => {
  const [subscription, setSubscription] = useState(null);
  const [tokenUsage, setTokenUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [subscriptionData, tokenData] = await Promise.all([
          getUserSubscription(),
          getUserTokenUsage()
        ]);
        setSubscription(subscriptionData);
        setTokenUsage(tokenData);
        setError(null);
      } catch (err) {
        console.error('Error fetching subscription data:', err);
        setError('Failed to load subscription information.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Listen for token usage updates from API responses
    const handleTokenUsageUpdate = (event) => {
      setTokenUsage(event.detail);
    };
    
    document.addEventListener('token-usage-updated', handleTokenUsageUpdate);
    
    return () => {
      document.removeEventListener('token-usage-updated', handleTokenUsageUpdate);
    };
  }, []);

  if (loading) {
    return <div className="subscription-loading">Loading subscription...</div>;
  }

  if (error) {
    return <div className="subscription-error">{error}</div>;
  }

  if (!subscription) {
    return <div className="subscription-error">No subscription data available.</div>;
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Determine status color class
  const statusClass = subscription.status === 'active' ? 'active' : 'inactive';
  
  // Determine days remaining warning level
  const getDaysRemainingClass = (days) => {
    if (days <= 3) return 'critical';
    if (days <= 7) return 'warning';
    return 'normal';
  };

  return (
    <div className="subscription-container">
      <div className="subscription-header">
        <h3>Your Subscription</h3>
      </div>
      <div className="subscription-content">
        <div className="subscription-info-row">
          <span className="subscription-label">Plan:</span>
          <span className="subscription-value">{subscription.plan.name}</span>
        </div>
        <div className="subscription-info-row">
          <span className="subscription-label">Status:</span>
          <span className={`subscription-value status-${statusClass}`}>
            {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
          </span>
        </div>
        <div className="subscription-info-row">
          <span className="subscription-label">Renewal:</span>
          <span className="subscription-value">
            {formatDate(subscription.end_date)}
          </span>
        </div>
        <div className="subscription-info-row">
          <span className="subscription-label">Days Left:</span>
          <span className={`subscription-value days-${getDaysRemainingClass(subscription.days_remaining)}`}>
            {subscription.days_remaining}
          </span>
        </div>
        <div className="subscription-info-row">
          <span className="subscription-label">Auto-Renew:</span>
          <span className="subscription-value">
            {subscription.auto_renew ? 'Yes' : 'No'}
          </span>
        </div>
      </div>
      
      {/* Token Usage Section */}
      <div className="subscription-header token-usage-header">
        <h3>Token Usage</h3>
      </div>
      {tokenUsage && (
        <div className="subscription-content token-usage-content">
          <div className="subscription-info-row">
            <span className="subscription-label">Daily Limit:</span>
            <span className="subscription-value">{tokenUsage.daily_token_limit}</span>
          </div>
          <div className="subscription-info-row">
            <span className="subscription-label">Used Today:</span>
            <span className="subscription-value">{Math.min(Math.max(0, tokenUsage.tokens_used_today), tokenUsage.daily_token_limit)}</span>
          </div>
          <div className="subscription-info-row">
            <span className="subscription-label">Remaining:</span>
            <span className="subscription-value">{Math.max(0, tokenUsage.remaining_tokens)}</span>
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
  );
};

export default SubscriptionInfo; 