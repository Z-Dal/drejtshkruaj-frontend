import React, { useState, useEffect } from 'react';
import { getUserSubscription } from '../../services/api';
import './UserStats.css';

const UserStats = () => {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        setLoading(true);
        const subscriptionData = await getUserSubscription();
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