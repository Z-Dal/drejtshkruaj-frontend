import React, { useState } from 'react';
import UserProfile from '../profile/UserProfile';
import TokenStatsWidget from '../profile/TokenStatsWidget';
import './MainLayout.css';

const MainLayout = ({ children }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <div className="main-layout">
      <div className="top-bar">
        <h1 className="app-title">Drejtshkruaj</h1>
        <div className="profile-section">
          <button 
            className="profile-toggle" 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <TokenStatsWidget minimal={true} />
          </button>
          {isProfileOpen && (
            <div className="profile-dropdown">
              <UserProfile minimal={false} />
            </div>
          )}
        </div>
      </div>
      <div className="main-content">
        {children}
      </div>
    </div>
  );
};

export default MainLayout; 