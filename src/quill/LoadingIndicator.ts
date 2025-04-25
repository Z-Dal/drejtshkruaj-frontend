import { QuillDrejtshkruaj } from "./quillDrejtshkruaj";
import html from "nanohtml/lib/browser";

/**
 * Manager for the loading indicator.
 *
 * This handles showing the checking status in the right stats panel.
 */
export default class LoadingIndicator {
  private currentIndicator?: HTMLElement;
  private style?: HTMLStyleElement;

  constructor(private readonly parent: QuillDrejtshkruaj) {
    // Add the animation styles once
    this.addStyles();
    
    // Ensure the layout is ready before showing the indicator
    requestAnimationFrame(() => {
      this.showEditing();
    });

    // Listen for text changes to switch back to editing state
    this.parent.quill.root.addEventListener('input', () => {
      if (this.currentIndicator?.classList.contains('checked')) {
        this.showEditing();
      }
    });
  }

  private addStyles() {
    this.style = document.createElement('style');
    this.style.textContent = `
      .status-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        font-size: 16px;
        transition: all 0.3s ease;
        background: #F8FAFC;
        position: relative;
        cursor: help;
        flex-shrink: 0;
      }

      .status-indicator.editing {
        color: #64748B;
      }

      .status-indicator.editing .pencil {
        transform-origin: 50% 50%;
        animation: writing 2s infinite;
      }

      .status-indicator.checking {
        color: #3B82F6;
      }

      .status-indicator.checking .magnifier {
        transform-origin: 50% 50%;
        animation: scanning 2s infinite ease-in-out;
      }

      .status-indicator.checking .scan-line {
        stroke-dasharray: 16;
        stroke-dashoffset: 16;
        animation: scanning-line 2s infinite linear;
      }

      .status-indicator.checked {
        color: #22C55E;
      }

      .status-indicator.checked .checkmark {
        stroke-dasharray: 20;
        stroke-dashoffset: 20;
        animation: draw-check 0.5s ease-in-out forwards;
      }

      @keyframes writing {
        0% { transform: rotate(-30deg) translateX(-2px); }
        50% { transform: rotate(0deg) translateX(2px); }
        100% { transform: rotate(-30deg) translateX(-2px); }
      }

      @keyframes scanning {
        0% { 
          transform: scale(1) rotate(-15deg);
          opacity: 0.8;
        }
        25% { 
          transform: scale(1.1) rotate(0deg);
          opacity: 1;
        }
        50% { 
          transform: scale(1) rotate(15deg);
          opacity: 0.8;
        }
        75% { 
          transform: scale(1.1) rotate(0deg);
          opacity: 1;
        }
        100% { 
          transform: scale(1) rotate(-15deg);
          opacity: 0.8;
        }
      }

      @keyframes scanning-line {
        0% { 
          stroke-dashoffset: 16;
          opacity: 0;
        }
        25% {
          opacity: 1;
        }
        75% {
          opacity: 1;
        }
        100% { 
          stroke-dashoffset: -16;
          opacity: 0;
        }
      }

      @keyframes draw-check {
        to {
          stroke-dashoffset: 0;
        }
      }
    `;
    document.head.appendChild(this.style);
  }

  private showEditing() {
    const indicator = html`
      <div class="status-indicator editing" title="Duke shkruar">
        <svg class="pencil" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
      </div>
    `;
    this.updateIndicator(indicator);
  }

  public startLoading() {
    if (!this.parent.params.showLoadingIndicator) return;

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
    const indicator = html`
      <div class="status-indicator checked" title="Kontrolli përfundoi">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path class="checkmark" d="M20 6L9 17L4 12"/>
        </svg>
      </div>
    `;
    this.updateIndicator(indicator);
  }

  private updateIndicator(newIndicator: HTMLElement) {
    // Remove existing indicator if any
    this.currentIndicator?.remove();
    
    // Find the header title
    const headerTitle = document.querySelector('.right-stats-panel .header h3');
    if (!headerTitle) {
      // If header is not found, retry after a short delay
      setTimeout(() => this.updateIndicator(newIndicator), 100);
      return;
    }
    
    // Create a container for header and indicator if it doesn't exist
    let headerContainer = headerTitle.parentElement?.querySelector('.header-container');
    if (!headerContainer) {
      headerContainer = document.createElement('div');
      headerContainer.className = 'header-container';
      headerTitle.parentElement?.insertBefore(headerContainer, headerTitle);
      headerContainer.appendChild(headerTitle);
    }
    
    // Add the new indicator
    headerContainer.appendChild(newIndicator);
    this.currentIndicator = newIndicator;
  }
}
