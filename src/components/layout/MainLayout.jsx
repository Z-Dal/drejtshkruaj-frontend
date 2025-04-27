import React, { useState } from 'react';
import UserProfile from '../profile/UserProfile';
import TokenStatsWidget from '../profile/TokenStatsWidget';
// import SpellingStats from '../sidebar/SpellingStats'; // Remove this import
import './MainLayout.css';

const MainLayout = ({ children }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <div className="main-layout">
      <div className="top-bar">
        <h1 className="app-title">
          drejt<span style={{ 
            color: '#f44336', 
            textDecoration: 'underline',
            textDecorationColor: '#f44336'
          }}>shkruaj</span>
        </h1>
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
      <div className="content-area">
        <div className="left-sidebar">
          <p>Left Sidebar</p>
        </div>
        <div className="editor-area">
          {children}
        </div>
        <div className="right-sidebar">
          {/* Placeholder for stats panel content */}
          {/* <SpellingStats /> */}
           <p>Right Sidebar</p> 
        </div>
      </div>
      <div className="bottom-bar">
        <p>Bottom Bar</p>
      </div>
    </div>
  );
};

export default MainLayout; 