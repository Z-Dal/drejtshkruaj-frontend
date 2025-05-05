import { QuillDrejtshkruaj } from "./quillDrejtshkruaj";

function html(strings: TemplateStringsArray, ...values: any[]) {
  const template = document.createElement("template");
  template.innerHTML = String.raw(strings, ...values).trim();
  return template.content.firstElementChild as HTMLElement;
}

/**
 * Manager for the loading indicator.
 *
 * This handles showing the checking status in the right stats panel.
 */
export default class LoadingIndicator {
  private currentIndicator?: HTMLElement;
  private style?: HTMLStyleElement;
  private _isLoading = false;
  private _isRateLimited = false;

  constructor(private readonly parent: QuillDrejtshkruaj) {
    this.addStyles();
  }

  private addStyles() {
    this.style = document.createElement("style");
    this.style.innerHTML = `
      .status-indicator {
        position: absolute;
        right: 12px;
        top: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: white;
        border: 1px solid #ddd;
        overflow: hidden;
        cursor: pointer;
        opacity: 0;
        transform: scale(0.8);
        transition: opacity 0.2s, transform 0.2s;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      }
      .status-indicator.visible {
        opacity: 1;
        transform: scale(1);
        animation: fadeIn 0.3s ease-out;
      }
      .status-indicator svg {
        color: #777;
      }
      .status-indicator svg .scan-line {
        animation: scanning 1.5s infinite;
        stroke-dasharray: 10;
        stroke-dashoffset: 20;
      }
      .status-indicator.checked svg {
        color: #38a169;
      }
      .status-indicator.checked svg .checkmark {
        stroke-dasharray: 20;
        stroke-dashoffset: 0;
      }
      
      /* Status indicator in right stats panel */
      .header-container {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .header-container h3 {
        margin: 0;
        flex: 1;
      }
      
      .right-stats-panel .status-indicator {
        position: relative;
        right: auto;
        top: auto;
        opacity: 1;
        transform: none;
        margin-left: 10px;
        border-radius: 6px;
        box-shadow: none;
      }
      
      /* Styles for the rate limited indicator */
      .right-stats-panel .status-indicator.rate-limited {
        background-color: #FFF4E5;
        border-color: #FFB74D;
        color: #E65100;
      }
      
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      
      @keyframes scanning {
        0% {
          stroke-dashoffset: 20;
        }
        50% {
          stroke-dashoffset: 0;
        }
        100% {
          stroke-dashoffset: -20;
        }
      }
      
      @keyframes stroke {
        100% {
          stroke-dashoffset: 20;
        }
      }
      
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `;
    document.head.appendChild(this.style);
  }

  private updateIndicator(element: HTMLElement) {
    if (this.currentIndicator) {
      // Remove the current indicator
      if (this.currentIndicator.parentNode) {
        this.currentIndicator.parentNode.removeChild(this.currentIndicator);
      }
    }

    this.currentIndicator = element;

    // Find the header container to place the indicator
    const headerTitle = document.querySelector('.right-stats-panel .header h3');
    
    if (!headerTitle) {
      console.error("Could not find the header title element in the right stats panel");
      // Fall back to adding it to the Quill container
      const container = this.parent.quill.container;
      if (container) {
        container.appendChild(element);
      }
      return;
    }
    
    // Create or find a container for the header and indicator
    let headerContainer = headerTitle.parentElement?.querySelector('.header-container');
    if (!headerContainer) {
      headerContainer = document.createElement('div');
      headerContainer.className = 'header-container';
      headerTitle.parentElement?.insertBefore(headerContainer, headerTitle);
      headerContainer.appendChild(headerTitle);
    }
    
    // Add the indicator to the header container
    headerContainer.appendChild(element);
    
    // Show immediately since we're in the side panel
    element.classList.add("visible");
  }

  public startLoading() {
    // If already loading, don't create another indicator
    if (this._isLoading) return;
    this._isLoading = true;
    
    // Set up the checking indicator
    const indicator = html`
      <div class="status-indicator checking" title="Duke kontrolluar">
        <svg class="magnifier" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <line class="scan-line" x1="7" y1="11" x2="15" y2="11"/>
        </svg>
      </div>
    `;
    
    this.updateIndicator(indicator);
  }

  public stopLoading() {
    // Don't stop if we're showing a rate limit message
    if (!this._isLoading && !this._isRateLimited) return;
    
    this._isLoading = false;
    
    if (this._isRateLimited) {
      // Keep showing the rate limit message for a bit longer
      setTimeout(() => {
        if (!this._isLoading) {
          this._isRateLimited = false;
          this.showCheckedIndicator();
        }
      }, 3000);
    } else {
      this.showCheckedIndicator();
    }
  }

  private showCheckedIndicator() {
    const indicator = html`
      <div class="status-indicator checked" title="Kontrolli përfundoi">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" stroke="none" fill="#38a169" fill-opacity="0.2"></circle>
          <path class="checkmark" d="M8 12l3 3l6-6" stroke="#38a169" stroke-width="2.5"></path>
        </svg>
      </div>
    `;
    
    this.updateIndicator(indicator);
    
    // Keep the indicator visible permanently
    if (this.currentIndicator) {
      this.currentIndicator.classList.add("visible");
    }
  }

  public showRateLimitMessage() {
    this._isRateLimited = true;
    
    const indicator = html`
      <div class="status-indicator rate-limited" title="Kufizim i shkallës. Po pres...">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
        </svg>
      </div>
    `;
    
    this.updateIndicator(indicator);
    
    // Auto-hide after a period
    setTimeout(() => {
      if (this._isRateLimited && !this._isLoading) {
        this._isRateLimited = false;
        this.showCheckedIndicator();
      }
    }, 5000);
  }
}
