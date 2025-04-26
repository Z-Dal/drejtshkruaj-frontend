import { createPopper } from "@popperjs/core";
import html from "nanohtml/lib/browser";
import raw from "nanohtml/raw";
import { QuillDrejtshkruaj } from "./quillDrejtshkruaj";
import { MatchesEntity } from "../types";
import type Quill from 'quill';
import { updateTokenUsageFromResponse } from '../services/api';

/**
 * Manager for popups.
 *
 * This handles opening and closing suggestion popups in the editor
 * when a suggestion is selected.
 */
export default class PopupManager {
  private openPopup?: HTMLElement;
  private currentSuggestionElement?: HTMLElement;

  constructor(private readonly parent: QuillDrejtshkruaj) {
    this.closePopup = this.closePopup.bind(this);
    this.addEventHandler();
    // Add document click listener to close popup when clicking outside
    document.addEventListener('click', (e) => {
      if (this.openPopup) {
        const target = e.target as HTMLElement;
        // Check if click is outside popup and not on a suggestion
        if (!this.openPopup.contains(target) && 
            !target.closest('quill-lt-match') && 
            !target.closest('quill-lt-popup')) {
          this.closePopup();
        }
      }
    });
  }

  private addEventHandler() {
    // Single click for spelling suggestions
    this.parent.quill.root.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "QUILL-LT-MATCH") {
        this.handleSuggestionClick(target);
      }
    });

    // Double click for word info
    this.parent.quill.root.addEventListener("dblclick", (e) => {
      // Get the clicked position
      const range = this.parent.quill.getSelection(true);
      if (range) {
        // Check if the clicked position is within a suggestion highlight
        const format = this.parent.quill.getFormat(range.index, 1);
        if (!format.ltmatch) {  // Only show word info if not a suggestion
          const text = this.parent.quill.getText();
          console.log("Double click - Selection range:", range);
          console.log("Text at position:", text.slice(Math.max(0, range.index - 10), range.index + 10));
          
          const wordBoundaries = this.getWordBoundaries(text, range.index);
          console.log("Word boundaries:", wordBoundaries);
          
          if (wordBoundaries) {
            const word = text.slice(wordBoundaries.start, wordBoundaries.end);
            console.log("Selected word:", word);
            
            if (word.trim()) {
              // Create a temporary span to anchor the popup
              const bounds = this.parent.quill.getBounds(wordBoundaries.start);
              console.log("Bounds:", bounds);
              
              if (bounds) {
                const tempSpan = document.createElement('span');
                tempSpan.className = 'quill-lt-match';
                tempSpan.style.position = 'absolute';
                tempSpan.style.left = `${bounds.left}px`;
                tempSpan.style.top = `${bounds.top}px`;
                tempSpan.textContent = word;
                tempSpan.style.visibility = 'hidden';
                tempSpan.style.pointerEvents = 'none';
                this.parent.quill.root.parentElement?.appendChild(tempSpan);
                
                this.createWordInfoPopup(word, tempSpan);
              }
            }
          }
        }
      }
    });

    window.addEventListener("resize", () => {
      if (this.currentSuggestionElement) {
        this.handleSuggestionClick(this.currentSuggestionElement);
      }
    });
  }

  private closePopup() {
    console.log("Closing popup", this.openPopup, this.currentSuggestionElement);
    if (this.openPopup) {
      this.openPopup.remove();
      this.openPopup = undefined;
    }
    // Also remove the temporary span if it exists
    if (this.currentSuggestionElement?.tagName === 'SPAN') {
      this.currentSuggestionElement.remove();
    }
    this.currentSuggestionElement = undefined;
  }

  private handleSuggestionClick(suggestion: HTMLElement) {
    const offset = parseInt(suggestion.getAttribute("data-offset") || "0");
    const length = parseInt(suggestion.getAttribute("data-length") || "0");
    const wordform = suggestion.getAttribute("data-wordform");
    
    // Find the specific match using a combination of offset, length, and wordform
    // This ensures we identify the exact match even when multiple matches share the same wordform
    const match = this.parent.matches.find(
      (m) => m.offset === offset && 
             m.length === length &&
             m.wordform === wordform
    );

    if (!match) {
      console.warn(`Could not find match for wordform "${wordform}" at offset ${offset}`);
      return;
    }

    this.createSuggestionPopup(match, suggestion);
  }

  private updateOffsets(replacementLength: number, originalLength: number, startOffset: number) {
    const diff = replacementLength - originalLength;
    console.log('Update params:', { replacementLength, originalLength, startOffset, diff });

    // First, adjust offsets for all matches
    const updatedMatches = this.parent.matches.map(match => {
      // Only adjust offsets for matches that come after the edit point
      if (match.offset > startOffset) {
        const newOffset = match.offset + diff;
        console.log('Adjusting offset:', {
          wordform: match.wordform,
          oldOffset: match.offset,
          newOffset,
          diff
        });
        return {
          ...match,
          offset: newOffset
        };
      }
      return match;
    });

    // Then filter out the match that was just fixed/replaced
    const finalMatches = updatedMatches.filter(match => {
      const keeping = match.offset !== startOffset;
      console.log('Filter decision for match:', {
        offset: match.offset,
        wordform: match.wordform,
        keeping
      });
      return keeping;
    });

    console.log('After update - matches:', JSON.stringify(finalMatches, null, 2));
    this.parent.matches = finalMatches;
    
    // Verify matches are still there before reload
    console.log('Before reloadBoxes - matches count:', this.parent.matches.length);
    this.parent.reloadBoxes();
    // Check matches after reload  
    console.log('After reloadBoxes - matches count:', this.parent.matches.length);
  }

  private createSuggestionPopup(match: MatchesEntity, suggestion: HTMLElement) {
    if (this.openPopup) {
      this.closePopup();
    }
    this.currentSuggestionElement = suggestion;

    // Get text once for both template and applySuggestion function
    const text = this.parent.quill.getText();

    const applySuggestion = (replacement: string) => {
      this.parent.preventLoop();
      
      if (match.action === 'delete') {
        // Get text to check for spaces
        const beforeChar = match.offset > 0 ? text[match.offset - 1] : null;
        const afterChar = text[match.offset + match.length];
        
        // Calculate total length to delete and offset adjustment
        let deleteStart = match.offset;
        let deleteLength = match.length;
        let offsetAdjustment = -match.length;

        // If between spaces and not at start, include the space before
        if (beforeChar === ' ' && afterChar === ' ' && match.offset > 0) {
          deleteStart = match.offset - 1;
          deleteLength = match.length + 1;
          offsetAdjustment = -(match.length + 1);
        }

        // Delete the text (including any extra space)
        this.parent.quill.deleteText(deleteStart, deleteLength);
        
        // Single updateOffsets call with the total adjustment
        this.updateOffsets(offsetAdjustment, match.length, match.offset);
      } else {
        // For other actions (replace)
        this.parent.quill.setSelection(match.offset, match.length);
        this.parent.quill.deleteText(match.offset, match.length);
        this.parent.quill.insertText(match.offset, replacement);
        this.parent.quill.setSelection(match.offset + replacement.length);
        this.updateOffsets(replacement.length, match.length, match.offset);
      }

      this.closePopup();
      this.parent.updateStats();
    };

    // Determine error type class
    let errorTypeClass = 'spelling-error';
    const shortMsg = match.shortMessage.toLowerCase();
    if (shortMsg.includes('gramatikore')) {
      errorTypeClass = 'grammar-error';
    } else if (shortMsg.includes('pikë')) {
      errorTypeClass = 'punctuation-error';
    }

    const popup = html`
      <quill-lt-popup role="tooltip">
        <div class="quill-lt-match-popup">
          <div class="quill-lt-match-popup-header" style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px; padding-top: 8px;">
            <div class="quill-lt-match-popup-title ${errorTypeClass}">${match.shortMessage}</div>
            <button
              class="quill-lt-match-popup-close"
              onclick="${this.closePopup}"
              style="margin-bottom: -4px;"
            >
              ${raw("&times;")}
            </button>
          </div>
          <div class="quill-lt-match-popup-description">${match.message}</div>

          <div class="quill-lt-match-popup-actions">
            ${match.action === 'delete' ? 
              html`
                <button
                  class="quill-lt-match-popup-action"
                  onclick=${() => applySuggestion('')}
                  style="display: flex; align-items: center; gap: 6px;"
                >
                  <span style="font-size: 1.1em;">✖</span>
                  ${text.slice(match.offset, match.offset + match.length)}
                </button>
              ` :
              match.suggestions?.slice(0, 3).map((suggestion) => {
                return html`
                  <button
                    class="quill-lt-match-popup-action"
                    data-replacement="${suggestion.value}"
                    onclick=${() => applySuggestion(suggestion.value)}
                    style="display: flex; align-items: center; gap: 6px;"
                  >
                    <span style="font-size: 1.1em;">↪</span>
                    ${suggestion.value}
                  </button>
                `;
              })
            }
          </div>

          <div style="margin: 0.25rem 0;">
            <button
              class="quill-lt-match-popup-action ignore-suggestion"
              style="display: flex; align-items: center; width: 100%; justify-content: flex-start; gap: 8px;"
              onclick=${() => {
                // Remove this match from parent.matches
                this.parent.matches = this.parent.matches.filter(m => 
                  m.offset !== match.offset || m.length !== match.length || m.wordform !== match.wordform
                );
                // Reload boxes to remove the highlight
                this.parent.reloadBoxes();
                this.closePopup();
              }}
            >
              <span style="font-size: 1.1em; display: flex; align-items: center;">⛔</span>
              <span style="display: flex; align-items: center; gap: 4px;">
                <span>Injoro</span>
                <span style="color: #94A3B8; font-size: 0.9em;">•</span>
                <span style="color: #94A3B8; font-size: 0.9em; font-style: italic;">${text.slice(match.offset, match.offset + match.length)}</span>
              </span>
            </button>
          </div>

          <div class="quill-lt-powered-by">
            Powered by <a href="">Drejtshkruaj</a>
          </div>
        </div>
        <div class="quill-lt-popup-arrow" data-popper-arrow></div>
      </quill-lt-popup>
    `;

    document.body.appendChild(popup);

    createPopper(suggestion, popup, {
      placement: "bottom-start",
      modifiers: [
        {
          name: "offset",
          options: {
            // Vertical offset for suggestion popups (spelling, grammar, punctuation)
            offset: [0, 6],
          },
        },
        {
          name: "preventOverflow",
          options: {
            padding: 8,
            boundary: "viewport",
          },
        },
      ],
    });

    this.openPopup = popup;
  }

  // Function to process suggestions
  private processSuggestions(suggestions: { value: string; action?: string }[]) {
    suggestions.forEach(suggestion => {
      if (suggestion.action === "delete") {
        // Display the word with strikethrough
        console.log(`Strikethrough: ${suggestion.value}`);
        
        // Replace the word with nothing (or remove it)
        // Assuming you have a method to update the text
        this.updateText(suggestion.value, '');
      }
    });
  }

  // Example function to update text (implementation depends on your application)
  private updateText(oldValue: string, newValue: string) {
    // Logic to find and replace the oldValue with newValue in your text
    // This could be a simple string replacement or more complex DOM manipulation
    console.log(`Replacing "${oldValue}" with "${newValue}"`);
  }

  private getWordBoundaries(text: string, position: number): { start: number; end: number } | null {
    // If we're at a space, return null
    if (/\s/.test(text[position])) {
      return null;
    }
    
    // Find the start of the word by looking backwards
    let start = position;
    while (start > 0 && !/\s/.test(text[start - 1])) {
      start--;
    }
    
    // Find the end of the word by looking forwards
    let end = position;
    while (end < text.length && !/\s/.test(text[end])) {
      end++;
    }
    
    // Get the word and clean surrounding punctuation but keep internal punctuation
    const word = text.slice(start, end);
    if (!word.trim()) {
      return null;
    }
    
    // Clean only surrounding punctuation, keeping internal punctuation and Albanian characters
    // Allow single character words and words with internal punctuation
    const match = word.match(/^[^\wëçÀ-ÿ\u0027\u2019']*([A-Za-zëçÀ-ÿ0-9][\wëçÀ-ÿ\u0027\u2019'\-]*|[A-Za-zëçÀ-ÿ0-9])[^\wëçÀ-ÿ\u0027\u2019']*$/);
    if (match) {
      const cleanWord = match[1];
      const startOffset = word.indexOf(cleanWord);
      return {
        start: start + startOffset,
        end: start + startOffset + cleanWord.length
      };
    }
    
    // If no match with the regex, but we have a trimmed word, return it
    const trimmed = word.trim();
    if (trimmed && /[A-Za-zëçÀ-ÿ0-9]/.test(trimmed)) {
      const startOffset = word.indexOf(trimmed);
      return {
        start: start + startOffset,
        end: start + startOffset + trimmed.length
      };
    }
    
    return null;
  }

  private async createWordInfoPopup(word: string, element: HTMLElement) {
    if (this.openPopup) {
      this.closePopup();
    }
    this.currentSuggestionElement = element;

    const popup = html`
      <quill-lt-popup role="tooltip">
        <div class="quill-lt-match-popup">
          <div class="quill-lt-match-popup-header" style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px; padding-top: 8px;">
            <div class="quill-lt-match-popup-title word-info-title">${word}</div>
            <button
              class="quill-lt-match-popup-close"
              onclick="${this.closePopup}"
              style="margin-bottom: -4px;"
            >
              ${raw("&times;")}
            </button>
          </div>
          <div class="quill-lt-match-popup-description">Mësoni më shumë rreth kësaj fjale.</div>

          <div class="quill-lt-match-popup-actions">
            <button
              class="quill-lt-match-popup-action word-info-action"
              onclick=${() => this.handleWordInfoAction(word, 'meaning')}
              style="display: flex; align-items: center; gap: 6px;"
            >
              <span style="font-size: 1.1em;">📖</span>
              Gjej kuptimin
            </button>
            <button
              class="quill-lt-match-popup-action word-info-action"
              onclick=${() => this.handleWordInfoAction(word, 'synonyms')}
              style="display: flex; align-items: center; gap: 6px;"
            >
              <span style="font-size: 1.1em;">🔄</span>
              Gjej sinonimet
            </button>
          </div>

          <div class="quill-lt-powered-by">
            Powered by <a href="">Drejtshkruaj</a>
          </div>
        </div>
        <div class="quill-lt-popup-arrow" data-popper-arrow></div>
      </quill-lt-popup>
    `;

    document.body.appendChild(popup);

    createPopper(element, popup, {
      placement: "bottom-start",
      modifiers: [
        {
          name: "offset",
          options: {
            // Vertical offset for word info popup (double-click)
            offset: [0, 10],
          },
        },
        {
          name: "preventOverflow",
          options: {
            padding: 8,
            boundary: "viewport",
          },
        }
      ],
    });

    this.openPopup = popup;
  }

  // Helper function to extract sentence context from position
  private getSentenceContext(text: string, position: number, word: string): { context: string, offset: number } | null {
    let sentenceStart = position;
    let sentenceEnd = position;

    // Look backwards for sentence start
    for (let i = position; i >= 0; i--) {
      if (text[i] === '\n' || (i > 0 && text[i - 1].match(/[.!?]/) && text[i] === ' ')) {
        sentenceStart = i === 0 ? 0 : i + 1;
        break;
      }
      if (i === 0) {
        sentenceStart = 0;
      }
    }

    // Look forwards for sentence end
    for (let i = position; i < text.length; i++) {
      if (text[i].match(/[.!?]/)) {
        sentenceEnd = i + 1;
        break;
      }
      if (text[i] === '\n') {
        sentenceEnd = i;
        break;
      }
      if (i === text.length - 1) {
        sentenceEnd = text.length;
      }
    }

    // Extract the sentence and clean it
    const context = text.slice(sentenceStart, sentenceEnd).trim();
    
    // Calculate word offset within this sentence
    const wordStart = text.indexOf(word, position - word.length);
    if (wordStart === -1) return null;
    
    const offset = wordStart - sentenceStart;

    return {
      context,
      offset
    };
  }

  private async handleWordInfoAction(word: string, action: 'meaning' | 'synonyms') {
    // Close the popup immediately
    this.closePopup();

    const text = this.parent.quill.getText();
    const selection = this.parent.quill.getSelection();
    if (!selection) return;

    const contextInfo = this.getSentenceContext(text, selection.index, word);
    if (!contextInfo) return;

    const { context, offset } = contextInfo;
    
    // Create context HTML string
    const contextHtml = context.slice(0, offset) + 
      `<span style="color: #2563EB; font-weight: 700;">${word}</span>` + 
      context.slice(offset + word.length);
    
    // Show immediate feedback in the side panel
    const rightStatsPanel = document.querySelector('.right-stats-panel');
    if (rightStatsPanel) {
      const wordInfoSection = document.querySelector('.word-info-section') || (() => {
        const section = document.createElement('div');
        section.className = 'word-info-section';
        rightStatsPanel.appendChild(section);
        return section;
      })();

      // Show loading state
      wordInfoSection.innerHTML = `
        <div class="word-info-header">
          <h3>Analizë e fjalës: <span style="color: #2563EB; font-weight: 700;">${word}</span></h3>
          <div style="color: #64748B; margin-top: 8px;">
            <div style="font-weight: 600; margin-bottom: 4px;">Konteksti:</div>
            <div style="font-style: italic;">${contextHtml}</div>
          </div>
        </div>
        <div class="word-info-content" style="display: flex; align-items: center; justify-content: center; min-height: 100px;">
          <div class="loading-dots">
            <div class="loading-dots-dot"></div>
            <div class="loading-dots-dot"></div>
            <div class="loading-dots-dot"></div>
          </div>
        </div>
      `;

      // Add the loading animation styles
      const style = document.createElement('style');
      style.textContent = `
        .loading-dots {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .loading-dots-dot {
          width: 10px;
          height: 10px;
          background-color: #3B82F6;
          border-radius: 50%;
          animation: loadingDotPulse 1.4s infinite ease-in-out;
        }

        .loading-dots-dot:nth-child(1) {
          animation-delay: -0.32s;
        }

        .loading-dots-dot:nth-child(2) {
          animation-delay: -0.16s;
        }

        @keyframes loadingDotPulse {
          0%, 80%, 100% { 
            transform: scale(0);
            opacity: 0.5;
          }
          40% { 
            transform: scale(1);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Prepare the request body
    const requestBody = {
      wordform: word,
      context: context,
      offset: offset,
      length: word.length
    };

    try {
      console.log(`Sending request to ${action} endpoint:`, requestBody);
      const endpoint = action === 'meaning' ? 'morphology' : 'synonyms';
      
      // Headers for the request
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      // If there's a manually stored auth token, try adding it to the request
      const authToken = localStorage.getItem('drejtshkruaj_auth_token');
      if (authToken) {
        console.log('Using manually stored auth token for word info request');
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const response = await fetch(this.parent.params.server + "drejtshkruaj/" + endpoint, {
        method: "POST",
        headers,
        mode: "cors",
        credentials: "include",
        body: JSON.stringify(requestBody)
      });

      // Handle authentication errors
      if (response.status === 401) {
        console.error("Authentication error: Unauthorized. Check if your cookie is being sent correctly");
        // Clear token if unauthorized
        localStorage.removeItem('drejtshkruaj_auth_token');
        // Redirect to login page after a short delay
        setTimeout(() => {
          window.location.href = '/login';
        }, 500);
        throw new Error('Authentication failed. Please login again.');
      }

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        throw new Error(typeof data === 'string' ? data : data.detail || `HTTP error! status: ${response.status}`);
      }

      console.log(`${action} API response:`, {
        data,
        type: typeof data,
        isArray: Array.isArray(data),
        keys: data ? Object.keys(data) : null,
        result: data?.result ? {
          wordform: data.result.wordform,
          morphology: data.result.morphology,
          context: data.result.context,
          dictionary: data.result.dictionary
        } : null
      });
      
      // Update token usage based on TST from response
      if (data && typeof data === 'object' && data.TST !== undefined) {
        console.log(`${action}API - Received TST:`, data.TST, typeof data.TST);
        updateTokenUsageFromResponse(data.TST);
      } else {
        console.log(`${action}API - No TST in response:`, data);
      }
      
      // Update the word info section with the response
      const wordInfoSection = document.querySelector('.word-info-section');
      if (wordInfoSection) {
        wordInfoSection.innerHTML = `
          <div class="word-info-header">
            <h3>Analizë e fjalës: <span style="color: #2563EB; font-weight: 700;">${word}</span></h3>
            <div style="color: #64748B; margin-top: 8px;">
              <div style="font-weight: 600; margin-bottom: 4px;">Konteksti:</div>
              <div style="font-style: italic;">${contextHtml}</div>
            </div>
          </div>
          <div class="word-info-content">
            ${this.formatWordInfo(data, action)}
          </div>
        `;
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Error fetching ${action}:`, error);
      
      // Show error in the panel with bold word in context
      const wordInfoSection = document.querySelector('.word-info-section');
      if (wordInfoSection) {
        wordInfoSection.innerHTML = `
          <div class="word-info-header">
            <h3>Analizë e fjalës: <span style="color: #2563EB; font-weight: 700;">${word}</span></h3>
            <div style="color: #64748B; margin-top: 8px;">
              <div style="font-weight: 600; margin-bottom: 4px;">Konteksti:</div>
              <div style="font-style: italic;">${contextHtml}</div>
            </div>
          </div>
          <div class="word-info-content" style="color: #ef4444;">
            ${error.message}
          </div>
        `;
      }
    }
  }

  private formatWordInfo(data: any, action: 'meaning' | 'synonyms'): string {
    // Log detailed information about the data structure
    console.log('Formatting data:', {
      data,
      type: typeof data,
      isArray: Array.isArray(data),
      keys: data ? Object.keys(data) : null,
      action
    });

    if (!data) {
      return `<div style="color: #475569;">
        Ende nuk kemi ndonjë informatë për këtë fjalë.
      </div>`;
    }

    // Extract result data if present in the new format
    const resultData = data.result || data;

    if (action === 'meaning') {
      return `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${resultData.morphology || resultData.dictionary ? `
            <div style="color: #475569; line-height: 1.6;">
              ${resultData.morphology ? `
                <div style="margin-bottom: 16px;">
                  <div style="font-weight: 600; color: #1E293B; margin-bottom: 4px;">
                    Morfologjia:
                  </div>
                  <div style="color: #475569;">
                    ${resultData.morphology}
                  </div>
                </div>
              ` : ''}
              
              <div>
                <div style="font-weight: 600; color: #1E293B; margin-bottom: 4px;">
                  Kuptimi në fjalor:
                </div>
                <div style="color: #475569;">
                  ${resultData.dictionary && resultData.dictionary !== 'NOT IMPLEMENTED YET' 
                    ? resultData.dictionary 
                    : '<span style="color: #94A3B8; font-style: italic;">Ende nuk është implementuar.</span>'}
                </div>
              </div>
            </div>
          ` : `
            <div style="color: #475569;">
              Ende nuk kemi ndonjë informatë për këtë fjalë.
            </div>
          `}
        </div>
      `;
    } else {
      return `<div style="color: #475569;">
        Nuk u gjetën sinonime për këtë fjalë.
      </div>`;
    }
  }
}