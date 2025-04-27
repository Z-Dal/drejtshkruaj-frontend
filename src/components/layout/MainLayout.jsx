import React, { useState, useEffect, useCallback } from 'react';
import UserProfile from '../profile/UserProfile';
import TokenStatsWidget from '../profile/TokenStatsWidget';
// import SpellingStats from '../sidebar/SpellingStats'; // Remove this import
import './MainLayout.css';

const SIDEBAR_BREAKPOINT = 1024; // Width below which sidebars close

// Simple SVG Icon resembling the screenshot
const SidebarToggleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="14" height="12" rx="1"/>
    <line x1="8" y1="4" x2="8" y2="16" />
  </svg>
);

const MainLayout = ({ children }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  // State for sidebars - start closed by default
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true); // Start open
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true); // Start open

  // Function to handle closing sidebars based on window width
  const handleResize = useCallback(() => {
    // Close sidebars if they are open and window is too small
    if (window.innerWidth < SIDEBAR_BREAKPOINT) {
        if (isLeftSidebarOpen) setIsLeftSidebarOpen(false);
        if (isRightSidebarOpen) setIsRightSidebarOpen(false);
    }
    // Optional: Re-open if window becomes larger than breakpoint? Let's keep it simple for now.
  }, [isLeftSidebarOpen, isRightSidebarOpen]); // Add dependencies

  // Add resize event listener
  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    // Cleanup listener on unmount
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]); // Re-run if handleResize changes

  return (
    <div className="main-layout">
      <div className="top-bar">
        {/* REMOVE Left Sidebar Toggle Button from here */}
        
        <h1 className="app-title">
          drejt<span style={{ 
            color: '#f44336', 
            textDecoration: 'underline',
            textDecorationColor: '#f44336'
          }}>shkruaj</span>
        </h1>
        <div className="profile-section">
          {/* User Profile Toggle */}
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
          
          {/* REMOVE Right Sidebar Toggle Button from here */} 
        </div>
      </div>
      {/* ADD Buttons inside content-area */} 
      <div className="content-area">
        {/* Button is NOW a SIBLING to the sidebar */} 
        <button 
           className={`sidebar-toggle left-toggle ${isLeftSidebarOpen ? 'open' : ''}`} // Add open class conditionally
           onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
           aria-label={isLeftSidebarOpen ? "Close Left Sidebar" : "Open Left Sidebar"}
         >
           <SidebarToggleIcon />
         </button>

        <div className={`left-sidebar ${!isLeftSidebarOpen ? 'closed' : ''}`}>
           {/* Button REMOVED from inside */}
           <p>Left Sidebar Content...</p>
        </div>

        <div className="editor-area">
          {children}
        </div>
        
        <div className={`right-sidebar ${!isRightSidebarOpen ? 'closed' : ''}`}>
            {/* Button REMOVED from inside */}
            {/* Stats panel container remains */} 
           <div className="stats-panel-container">
                {/* Content will be injected here */}
           </div>
        </div>
        
        {/* Button is NOW a SIBLING to the sidebar */} 
        <button 
           className={`sidebar-toggle right-toggle ${isRightSidebarOpen ? 'open' : ''}`} // Add open class conditionally
           onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
           aria-label={isRightSidebarOpen ? "Close Right Sidebar" : "Open Right Sidebar"}
         >
           <SidebarToggleIcon />
         </button>

      </div>
      <div className="bottom-bar">
        <p>Bottom Bar</p>
      </div>
    </div>
  );
};

export default MainLayout; 