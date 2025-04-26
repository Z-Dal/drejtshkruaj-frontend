import React from 'react';
import { useAuth } from '../../auth/AuthContext';
import SubscriptionInfo from './SubscriptionInfo';
import './UserProfile.css';

const UserProfile = ({ minimal = false }) => {
  const { user, logout } = useAuth();

  const handleLogout = async (e) => {
    e.stopPropagation();
    await logout();
  };

  if (!user) {
    return null;
  }

  if (minimal) {
    return (
      <div className="profile-avatar" title={user.username}>
        {user.username.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div className="profile-container" onClick={(e) => e.stopPropagation()}>
      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-title">
            <div className="profile-avatar">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="profile-name">
              <h3>{user.username}</h3>
              <p className="profile-email">{user.email}</p>
            </div>
          </div>
        </div>
        <div className="profile-info">
          <div className="account-details">
            <div className="info-group">
              <label>Account Status</label>
              <p className={`status ${user.is_active ? 'active' : 'inactive'}`}>
                {user.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>
            <div className="info-group">
              <label>Email Verification</label>
              <p className={`status ${user.is_verified ? 'verified' : 'unverified'}`}>
                {user.is_verified ? 'Verified' : 'Not Verified'}
              </p>
            </div>
          </div>
          
          {/* Subscription Info Component */}
          <SubscriptionInfo />
          
          <button onClick={handleLogout} className="logout-button">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfile; 