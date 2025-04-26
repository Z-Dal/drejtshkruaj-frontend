import { getUserTokenUsage } from '../../services/api';
import './EditorTokenWidget.css';

/**
 * Function to add the token widget to the editor's right stats panel
 * This function should be called after the editor is initialized
 */
export const addTokenWidgetToEditor = async () => {
  try {
    // Fetch token usage data
    const tokenUsage = await getUserTokenUsage();
    
    // Find the right stats panel
    const rightStatsPanel = document.querySelector('.right-stats-panel');
    if (!rightStatsPanel) {
      console.error('Right stats panel not found');
      return;
    }
    
    // Check if token widget already exists
    if (document.querySelector('.token-stats-container')) {
      return;
    }
    
    // Create token widget container
    const tokenWidget = document.createElement('div');
    tokenWidget.className = 'token-stats-container';
    
    // Calculate percentage used
    const percentUsed = (tokenUsage.tokens_used_today / tokenUsage.daily_token_limit) * 100;
    const tokenStatus = percentUsed > 80 ? 'critical' : percentUsed > 50 ? 'low' : 'good';
    
    // Set the HTML content
    tokenWidget.innerHTML = `
      <div class="token-stats-header">
        <h3>Token Usage</h3>
      </div>
      <div class="token-stats-content">
        <div class="token-stats-info">
          <div class="token-stats-item">
            <span class="label">Remaining:</span>
            <span class="value">${tokenUsage.remaining_tokens}</span>
          </div>
          <div class="token-stats-item">
            <span class="label">Used today:</span>
            <span class="value">${tokenUsage.tokens_used_today}</span>
          </div>
          <div class="token-stats-item">
            <span class="label">Daily limit:</span>
            <span class="value">${tokenUsage.daily_token_limit}</span>
          </div>
        </div>
        <div class="token-editor-progress-container">
          <div 
            class="token-editor-progress-bar ${tokenStatus}" 
            style="width: ${Math.min(100, percentUsed)}%"
          ></div>
        </div>
      </div>
    `;
    
    // Add to the right stats panel
    rightStatsPanel.appendChild(tokenWidget);
    
    // Listen for token usage updates from API responses
    const handleTokenUsageUpdate = (event) => {
      console.log('EditorTokenWidget - Received token-usage-updated event:', event.detail);
      const updatedUsage = event.detail;
      const updatedPercentUsed = (updatedUsage.tokens_used_today / updatedUsage.daily_token_limit) * 100;
      const updatedStatus = updatedPercentUsed > 80 ? 'critical' : updatedPercentUsed > 50 ? 'low' : 'good';
      
      // Update the values
      const remainingEl = document.querySelector('.token-stats-info .token-stats-item:nth-child(1) .value');
      const usedEl = document.querySelector('.token-stats-info .token-stats-item:nth-child(2) .value');
      const progressBar = document.querySelector('.token-editor-progress-bar');
      
      if (remainingEl) remainingEl.textContent = updatedUsage.remaining_tokens;
      if (usedEl) usedEl.textContent = updatedUsage.tokens_used_today;
      if (progressBar) {
        progressBar.style.width = `${Math.min(100, updatedPercentUsed)}%`;
        progressBar.className = `token-editor-progress-bar ${updatedStatus}`;
      }
    };
    
    document.addEventListener('token-usage-updated', handleTokenUsageUpdate);
    
    // Set up refresh interval (every 5 minutes)
    setInterval(async () => {
      try {
        const updatedUsage = await getUserTokenUsage();
        const updatedPercentUsed = (updatedUsage.tokens_used_today / updatedUsage.daily_token_limit) * 100;
        const updatedStatus = updatedPercentUsed > 80 ? 'critical' : updatedPercentUsed > 50 ? 'low' : 'good';
        
        // Update the values
        const remainingEl = document.querySelector('.token-stats-info .token-stats-item:nth-child(1) .value');
        const usedEl = document.querySelector('.token-stats-info .token-stats-item:nth-child(2) .value');
        const progressBar = document.querySelector('.token-editor-progress-bar');
        
        if (remainingEl) remainingEl.textContent = updatedUsage.remaining_tokens;
        if (usedEl) usedEl.textContent = updatedUsage.tokens_used_today;
        if (progressBar) {
          progressBar.style.width = `${Math.min(100, updatedPercentUsed)}%`;
          progressBar.className = `token-editor-progress-bar ${updatedStatus}`;
        }
      } catch (error) {
        console.error('Failed to update token usage:', error);
      }
    }, 5 * 60 * 1000);
    
  } catch (error) {
    console.error('Failed to add token widget to editor:', error);
  }
}; 