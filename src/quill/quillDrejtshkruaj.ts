import type Quill from "quill";
import debug from "../utils/debug";
import { SuggestionBoxes } from "./SuggestionBoxes";
import "./PopUp.css";
import createSuggestionBlotForQuillInstance from "./SuggestionBlot";
import PopupManager from "./PopupManager";
import { DrejtshkruajApi, DrejtshkruajApiParams, MatchesEntity } from "../types";
import LoadingIndicator from "./LoadingIndicator";
import { TextChunker } from './TextChunker';
import { updateTokenUsageFromResponse } from '../services/api';
import Delta from "quill-delta";

export type QuillDrejtshkruajParams = {
  server: string;
  language: string;
  disableNativeSpellcheck: boolean;
  cooldownTime: number;
  showLoadingIndicator: boolean;
  apiOptions?: Partial<DrejtshkruajApiParams>;
};

type ParamsObject = {
  text: string;
};

export class QuillDrejtshkruaj {
  static DEFAULTS: QuillDrejtshkruajParams = {
    server: "http://localhost:8000/",
    language: "sq",
    disableNativeSpellcheck: true,
    cooldownTime: 4000,
    showLoadingIndicator: true,
    apiOptions: {},
  };

  protected typingCooldown?: NodeJS.Timeout;
  protected loopPreventionCooldown?: NodeJS.Timeout;
  protected boxes: SuggestionBoxes;
  protected popups: PopupManager;
  protected loader: LoadingIndicator;
  public matches: MatchesEntity[] = [];
  private paragraphCache: Map<number, { text: string, startOffset: number }> = new Map();

  // Add counters for stats
  private spellingCount: number = 0;
  private grammarCount: number = 0;
  private punctuationCount: number = 0;

  constructor(public quill: Quill, public params: QuillDrejtshkruajParams) {
    debug("Attaching QuillDrejtshkruaj to Quill instance", quill);

    // Add placeholder text
    this.quill.root.dataset.placeholder = 'Shkruani tekstin këtu...';
    
    // Setup the layout first so the indicator has somewhere to attach
    this.setupLayout();
    
    // Initialize the components in the correct order
    this.loader = new LoadingIndicator(this);
    this.boxes = new SuggestionBoxes(this);
    this.popups = new PopupManager(this);
    
    // Add space key handler
    this.addSpaceKeyHandler();
    
    this.quill.on("text-change", (_delta, _oldDelta, source) => {
      if (source === "user") {
        this.onTextChange(_delta);
      }
    });
    
    // Start spell checking
    this.checkSpelling();
    this.disableNativeSpellcheckIfSet();
  }

  private disableNativeSpellcheckIfSet() {
    if (this.params.disableNativeSpellcheck) {
      this.quill.root.setAttribute("spellcheck", "false");
    }
  }

  private onTextChange(delta: any) {
    if (this.loopPreventionCooldown) return;
    if (this.typingCooldown) {
      clearTimeout(this.typingCooldown);
    }

    // Process the delta to identify which paragraph was modified
    if (delta && delta.ops) {
      let changeStart = 0;
      let hasDelete = false;
      let textDeleted = false;
      let matchesToRemove: MatchesEntity[] = []; // Keep track of matches removed in this delta
      
      // Calculate the affected range from delta ops
      delta.ops.forEach((op: any) => {
        if (op.retain) {
          changeStart += op.retain;
        }
        if (op.delete) {
          hasDelete = true;
          textDeleted = true;
          const deleteEnd = changeStart + op.delete;
          
          // Identify matches within the deleted range BEFORE filtering
          const removedInOp = this.matches.filter(m => m.offset >= changeStart && m.offset < deleteEnd);
          matchesToRemove.push(...removedInOp);
          
          // Filter the main matches array
          this.matches = this.matches.filter(m => !(m.offset >= changeStart && m.offset < deleteEnd));
          
          // Update offsets for matches AFTER the deletion
          this.matches.forEach(match => {
            if (match.offset >= deleteEnd) {
              match.offset -= op.delete;
            }
          });
        }
        if (op.insert || op.delete) {
          // Find paragraph boundaries
          const text = this.quill.getText();
          let paraStart = changeStart;
          let paraEnd = changeStart;
          
          // Find paragraph start
          while (paraStart > 0 && text[paraStart - 1] !== '\n') {
            paraStart--;
          }
          
          // Find paragraph end
          while (paraEnd < text.length && text[paraEnd] !== '\n') {
            paraEnd++;
          }
          
          // For insert operations, calculate the length change
          if (op.insert) {
            const insertLength = typeof op.insert === 'string' ? op.insert.length : 1;
            
            // Update offsets for matches AFTER the insertion point
            this.matches.forEach(match => {
              if (match.offset >= changeStart) {
                match.offset += insertLength;
              }
            });
            
            // Only clear highlights for the affected paragraph
            this.boxes.removeSuggestionBoxesInRange(paraStart, paraEnd + insertLength);
          } else {
            // For deletions, already handled above
            this.boxes.removeSuggestionBoxesInRange(paraStart, paraEnd);
          }
          
          // Clear cache for this paragraph
          this.clearCacheForRange(paraStart, paraEnd);
          
          console.log('Cleared cache for range:', {
            paraStart,
            paraEnd,
            text: text.slice(paraStart, paraEnd)
          });
          
          // Check this specific paragraph immediately if it has content
          const paragraphText = text.slice(paraStart, paraEnd).trim();
          if (paragraphText) {
            // Schedule immediate check for this paragraph only
            setTimeout(() => {
              const chunk = {
                text: text.slice(paraStart, paraEnd),
                startOffset: paraStart,
                endOffset: paraEnd,
                index: -1 // Will be set by checkParagraphSpelling
              };
              this.checkParagraphSpelling(chunk);
            }, 100); // Short delay to let Quill finish rendering
          }
        }
      });
      
      // Check if all text was deleted
      const currentText = this.quill.getText().trim();
      if (currentText === '' && textDeleted) {
        this.matches = [];
        matchesToRemove = []; // No matches left to remove stats for
        this.spellingCount = 0;
        this.grammarCount = 0;
        this.punctuationCount = 0;
        hasDelete = true; // Ensure stats/boxes update below
      }
      
      // If text was deleted, update counts and UI right away
      if (hasDelete) {
        // Decrement stats based on removed matches
        matchesToRemove.forEach(m => {
          if (m.shortMessage.toLowerCase().includes('drejtshkrimore')) this.spellingCount--;
          if (m.shortMessage.toLowerCase().includes('gramatikore')) this.grammarCount--;
          if (m.shortMessage.toLowerCase().includes('pikë')) this.punctuationCount--;
        });
        // Ensure counts don't go below zero
        this.spellingCount = Math.max(0, this.spellingCount);
        this.grammarCount = Math.max(0, this.grammarCount);
        this.punctuationCount = Math.max(0, this.punctuationCount);

        // Immediately update stats display
        this.updateStats(); 
        
        // Call the NEW method to remove ONLY the specific matches
        if (matchesToRemove.length > 0) {
          this.boxes.removeMatches(matchesToRemove);
        }
      }
    }

    // Set cooldown for the full check (which will recalculate counts and re-add boxes)
    this.typingCooldown = setTimeout(() => {
      debug("User stopped typing, checking spelling");
      // First clear this specific range to prevent visual artifacts
      const text = this.quill.getText();
      const fullRefresh = text.length < 1000; // Only do full refresh for smaller documents
      
      // Check all paragraphs
      this.checkSpelling().then(() => {
        // After checking, ensure all highlights are visible with a slight delay
        // to let Quill finish any rendering operations
        if (!fullRefresh) {
          setTimeout(() => this.refreshAllHighlights(), 100);
        }
      });
    }, this.params.cooldownTime);
  }

  public async reloadBoxes() {
    this.boxes.removeSuggestionBoxes();
    this.boxes.addSuggestionBoxes();
  }

  private async checkSpelling() {
    if (document.querySelector("lt-toolbar")) {
      debug("Drejtshkruaj is installed as extension, not checking");
      return;
    }

    debug("Checking spelling");
    this.loader.startLoading();

    // Get current text and chunks
    const currentText = this.quill.getText();
    const chunks = TextChunker.getChunks(currentText);
    
    console.log('Processing chunks:', chunks.length);
    
    // Reset counts before recalculating from API results
    this.spellingCount = 0;
    this.grammarCount = 0;
    this.punctuationCount = 0;

    // Process chunks in parallel but handle UI updates independently
    const chunkPromises = chunks.map(async (chunk) => {
      const cachedEntry = this.paragraphCache.get(chunk.index);
      
      if (cachedEntry && cachedEntry.text === chunk.text) {
        // Paragraph unchanged, but update match offsets if the paragraph shifted
        const offsetDiff = chunk.startOffset - cachedEntry.startOffset;
        if (offsetDiff !== 0) {
          this.matches.forEach(match => {
            if (match.offset >= cachedEntry.startOffset && 
                (match.offset + match.length) <= (cachedEntry.startOffset + cachedEntry.text.length + 1)) {
              match.offset += offsetDiff;
            }
          });
        }
        // Update cache with new start offset
        this.paragraphCache.set(chunk.index, { text: chunk.text, startOffset: chunk.startOffset });
        
        // We'll refresh all boxes at the end, so no need to update individually here
        return; // Skip processing for unchanged paragraphs
      }
      
      console.log('Processing changed chunk:', {
        offset: chunk.startOffset,
        text: chunk.text.substring(0, 50) + '...'
      });
      
      // Process this chunk if it's non-empty
      if (chunk.text.trim()) {
        const json = await this.getDrejtshkruajResults(chunk.text);
        
        if (json && json.matches) {
          // Remove existing matches in this chunk's range
          const matchesToRemove = this.matches.filter(m => 
            m.offset >= chunk.startOffset && m.offset < chunk.endOffset
          );
          
          // Update stats counters for removed matches
          matchesToRemove.forEach(m => {
            if (m.shortMessage.toLowerCase().includes('drejtshkrimore')) this.spellingCount--;
            if (m.shortMessage.toLowerCase().includes('gramatikore')) this.grammarCount--;
            if (m.shortMessage.toLowerCase().includes('pikë')) this.punctuationCount--;
          });
          
          // Remove matches from the array
          this.matches = this.matches.filter(m => 
            !(m.offset >= chunk.startOffset && m.offset < chunk.endOffset)
          );
          
          // Add new matches with adjusted offsets
          const adjustedMatches = json.matches.map(match => ({
            ...match,
            offset: match.offset + chunk.startOffset
          }));
          
          this.matches.push(...adjustedMatches);
          
          // Update stats counters for new matches
          adjustedMatches.forEach(m => {
            if (m.shortMessage.toLowerCase().includes('drejtshkrimore')) this.spellingCount++;
            if (m.shortMessage.toLowerCase().includes('gramatikore')) this.grammarCount++;
            if (m.shortMessage.toLowerCase().includes('pikë')) this.punctuationCount++;
          });
        }
      }
      
      // Update cache
      this.paragraphCache.set(chunk.index, { text: chunk.text, startOffset: chunk.startOffset });
    });
    
    // Wait for all chunks to finish processing
    await Promise.all(chunkPromises);
    
    // Update stats now that all paragraphs are processed
    this.updateStats();
    
    // Force a complete refresh of all boxes after everything is done
    this.refreshAllHighlights();
    
    this.loader.stopLoading();
  }

  private getApiParams(text: string) {
    return {
      text: text,
    };
  }

  private async getDrejtshkruajResults(text: string) {
    const params = this.getApiParams(text);

    try {
      // Debug: Log cookies to see if auth cookie exists
      console.log('Cookies before spellings request:', document.cookie);
      
      // Headers for the request
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      // If there's a manually stored auth token, try adding it to the request
      const authToken = localStorage.getItem('drejtshkruaj_auth_token');
      if (authToken) {
        console.log('Using manually stored auth token');
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const response = await fetch(this.params.server + "drejtshkruaj/spellings", {
        method: "POST",
        headers,
        credentials: "include",
        mode: "cors",
        body: JSON.stringify(params),
      });
      
      if (response.status === 401) {
        console.error("Authentication error: Unauthorized. Check if your cookie is being sent correctly");
        // Clear token if unauthorized
        localStorage.removeItem('drejtshkruaj_auth_token');
        // Redirect to login page after a short delay to allow console messages to be seen
        setTimeout(() => {
          window.location.href = '/login';
        }, 500);
        return null;
      }
      
      const json = (await response.json()) as DrejtshkruajApi;
      
      // Update token usage based on TST from response
      if (json && json.TST !== undefined) {
        console.log('SpellingsAPI - Received TST:', json.TST, typeof json.TST);
        updateTokenUsageFromResponse(json.TST);
      } else {
        console.log('SpellingsAPI - No TST in response:', json);
      }
      
      return json;
    } catch (e) {
      console.error("Error in getDrejtshkruajResults:", e);
      return null;
    }
  }

  public preventLoop() {
    if (this.loopPreventionCooldown) {
      clearTimeout(this.loopPreventionCooldown);
    }
    this.loopPreventionCooldown = setTimeout(() => {
      this.loopPreventionCooldown = undefined;
    }, 100);
  }

  private setupLayout() {
    // Find the target element where the stats should be placed
    const sidebarTarget = document.querySelector('.right-sidebar');

    if (!sidebarTarget) {
      console.error("QuillDrejtshkruaj Error: Could not find the .right-sidebar element in the DOM. Stats panel cannot be attached.");
      return;
    }

    // Clear any existing placeholder content in the sidebar
    sidebarTarget.innerHTML = ''; 

    // Create the stats panel content (using a temporary div just to set innerHTML easily)
    const statsContentHTML = `
      <div class="right-stats-panel"> <!-- Add a wrapper class for styling if needed -->
        <div class="header">
          <h3>VËREJTJET GJUHËSORE</h3>
          <!-- Add Edit button here if needed -->
        </div>
        <div class="stats-counter">
          <div class="counter-item counter-spelling">
            <div class="counter-label">
              <span class="counter-dot"></span>
              Drejtshkrimore
            </div>
            <div class="counter-value">0</div>
          </div>
          <div class="counter-item counter-grammar">
            <div class="counter-label">
              <span class="counter-dot"></span>
              Gramatikore
            </div>
            <div class="counter-value">0</div>
          </div>
          <div class="counter-item counter-punctuation">
            <div class="counter-label">
              <span class="counter-dot"></span>
              Pikësimi
            </div>
            <div class="counter-value">0</div>
          </div>
          <div class="counter-item counter-total">
            <div class="counter-label">Gjithsej</div>
            <div class="counter-value">0</div>
          </div>
        </div>
      </div>
    `;

    // Inject the stats panel HTML into the sidebar target
    sidebarTarget.innerHTML = statsContentHTML;
    
    // Note: We are no longer manipulating the Quill container's position directly here.
    // It's assumed React places the Quill editor correctly within the .editor-area.
  }

  public updateStats() {
    try {
      // Make sure counts are not negative
      this.spellingCount = Math.max(0, this.spellingCount);
      this.grammarCount = Math.max(0, this.grammarCount);
      this.punctuationCount = Math.max(0, this.punctuationCount);
      
      // Log current stats for debugging
      console.log('Updating stats:', {
        spelling: this.spellingCount,
        grammar: this.grammarCount,
        punctuation: this.punctuationCount,
        total: this.spellingCount + this.grammarCount + this.punctuationCount
      });
      
      // Update the DOM elements IN THE SIDEBAR using the class properties
      const spellingCounter = document.querySelector('.right-sidebar .counter-spelling .counter-value');
      const grammarCounter = document.querySelector('.right-sidebar .counter-grammar .counter-value');
      const punctuationCounter = document.querySelector('.right-sidebar .counter-punctuation .counter-value');
      const totalCounter = document.querySelector('.right-sidebar .counter-total .counter-value');

      if (spellingCounter) spellingCounter.textContent = this.spellingCount.toString();
      if (grammarCounter) grammarCounter.textContent = this.grammarCount.toString();
      if (punctuationCounter) punctuationCounter.textContent = this.punctuationCount.toString();
      if (totalCounter) totalCounter.textContent = (this.spellingCount + this.grammarCount + this.punctuationCount).toString();
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  }

  // Add method to clear cache for a specific range
  private clearCacheForRange(start: number, end: number) {
    const chunks = TextChunker.getChunks(this.quill.getText());
    for (const chunk of chunks) {
      // If the chunk overlaps with [start, end], clear its cache entry
      if (!(chunk.endOffset < start || chunk.startOffset > end)) {
        this.paragraphCache.delete(chunk.index);
      }
    }
  }

  // Add an onKey handler to handle space key more aggressively
  private addSpaceKeyHandler() {
    // Add direct event listener for space key to stop highlight stretching
    this.quill.root.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.keyCode === 32) {
        // Get current cursor position before space is inserted
        const selection = this.quill.getSelection();
        if (selection) {
          // Immediately remove any highlight that would extend past this point
          this.stripHighlightsAtCursor(selection.index);
          
          // Schedule another check after the space is inserted
          setTimeout(() => {
            const newSelection = this.quill.getSelection();
            if (newSelection) {
              this.stripHighlightsAtCursor(newSelection.index);
            }
          }, 0);
        }
      }
    });
  }
  
  // Aggressively strip highlights at and after cursor
  private stripHighlightsAtCursor(cursorPosition: number) {
    try {
      if (cursorPosition === undefined || cursorPosition < 0) {
        console.warn('Invalid cursor position in stripHighlightsAtCursor:', cursorPosition);
        return;
      }
      
      // Validate cursor position is within document bounds
      const textLength = this.quill.getText().length;
      if (cursorPosition > textLength) {
        console.warn('Cursor position out of bounds:', cursorPosition, 'text length:', textLength);
        return;
      }
      
      // For each match in our collection
      this.matches.forEach(match => {
        if (!match || typeof match.offset !== 'number' || typeof match.length !== 'number') {
          return; // Skip invalid matches
        }
        
        // If this match extends to or beyond cursor position
        if (match.offset + match.length >= cursorPosition) {
          // If match starts before cursor
          if (match.offset < cursorPosition) {
            try {
              // 1. Remove the entire formatting
              this.quill.formatText(match.offset, match.length, 'ltmatch', false, 'silent');
              
              // 2. Calculate new length that stops at cursor
              const newLength = cursorPosition - match.offset;
              
              // 3. Only if something remains to highlight
              if (newLength > 0) {
                // 4. Create a new match object with correct length
                const correctedMatch = { ...match, length: newLength };
                
                // 5. Apply the corrected highlighting (stopping at cursor)
                this.quill.formatText(match.offset, newLength, 'ltmatch', correctedMatch, 'silent');
                
                // 6. Update the match length in our data
                match.length = newLength;
              }
            } catch (err) {
              console.error('Error trimming highlight at cursor:', err);
            }
          } else {
            // For matches that start at or after cursor, remove formatting completely
            try {
              this.quill.formatText(match.offset, match.length, 'ltmatch', false, 'silent');
            } catch (err) {
              console.error('Error removing highlight after cursor:', err);
            }
          }
        }
      });
      
      // Restore cursor position safely
      try {
        const selection = this.quill.getSelection();
        if (selection) {
          this.quill.setSelection(selection.index, 0, 'silent');
        }
      } catch (err) {
        console.error('Error restoring cursor position:', err);
      }
    } catch (err) {
      console.error('Error in stripHighlightsAtCursor:', err);
    }
  }

  // Call this to check all paragraphs (e.g., on load or paste)
  private checkAllParagraphs() {
    const text = this.quill.getText();
    const chunks = TextChunker.getChunks(text);
    for (const chunk of chunks) {
      this.checkParagraphSpelling(chunk);
    }
  }

  // Improved method to fix underline spreading when pressing space
  private fixUnderlineSpread(changePosition: number) {
    // First call the more aggressive method to handle any current highlights at cursor
    this.stripHighlightsAtCursor(changePosition);
    
    // Additional processing if needed...
    const text = this.quill.getText();
    
    // Force Quill to re-render to ensure formatting is correctly displayed
    setTimeout(() => {
      const selection = this.quill.getSelection();
      if (selection) {
        this.quill.setSelection(selection, 'silent');
      }
    }, 10);
  }

  // Checks spelling for a single paragraph chunk
  private async checkParagraphSpelling(chunk: { text: string, startOffset: number, endOffset: number, index: number }) {
    try {
      if (!chunk.text.trim()) return;
      
      // If index was not set (like when calling from onTextChange), calculate it
      if (chunk.index === -1) {
        // Use the paragraph offset to determine a unique index
        chunk.index = chunk.startOffset;
      }
      
      this.loader.startLoading();
      
      const json = await this.getDrejtshkruajResults(chunk.text);
      
      if (json && json.matches) {
        // Remove any existing matches in this range
        const matchesToRemove = this.matches.filter(m => 
          m.offset >= chunk.startOffset && m.offset < chunk.endOffset
        );
        
        // Update stats counter for removed matches
        matchesToRemove.forEach(m => {
          if (m.shortMessage.toLowerCase().includes('drejtshkrimore')) this.spellingCount--;
          if (m.shortMessage.toLowerCase().includes('gramatikore')) this.grammarCount--;
          if (m.shortMessage.toLowerCase().includes('pikë')) this.punctuationCount--;
        });
        
        // Remove matches from the array
        this.matches = this.matches.filter(m => 
          !(m.offset >= chunk.startOffset && m.offset < chunk.endOffset)
        );
        
        // Add new matches with adjusted offsets
        const adjustedMatches = json.matches.map(match => ({
          ...match,
          offset: match.offset + chunk.startOffset
        }));
        
        this.matches.push(...adjustedMatches);
        
        // Update stats counter for new matches
        adjustedMatches.forEach(m => {
          if (m.shortMessage.toLowerCase().includes('drejtshkrimore')) this.spellingCount++;
          if (m.shortMessage.toLowerCase().includes('gramatikore')) this.grammarCount++;
          if (m.shortMessage.toLowerCase().includes('pikë')) this.punctuationCount++;
        });
        
        console.log(`Added ${adjustedMatches.length} matches for paragraph at offset ${chunk.startOffset}`);
      }
      
      // Update cache
      this.paragraphCache.set(chunk.index, { text: chunk.text, startOffset: chunk.startOffset });
      
      // Update UI safely
      try {
        // Update stats
        this.updateStats();
        
        // Focus on this paragraph's highlights but also refresh all to ensure consistent state
        this.boxes.removeSuggestionBoxesInRange(chunk.startOffset, chunk.endOffset);
        this.boxes.updateSuggestionBoxesForRange(chunk.startOffset, chunk.endOffset);
        
        // Do a full refresh to ensure all highlights are properly displayed
        setTimeout(() => this.refreshAllHighlights(), 50);
      } catch (error) {
        console.error('Error updating UI after paragraph check:', error);
      }
      
      this.loader.stopLoading();
    } catch (error) {
      console.error('Error in checkParagraphSpelling:', error);
      this.loader.stopLoading();
    }
  }

  /**
   * Force a complete refresh of all highlights to ensure all suggestions are visible
   */
  private refreshAllHighlights() {
    try {
      console.log('Refreshing all highlights...');
      
      // Store current selection
      const selection = this.quill.getSelection();
      
      // Get all current matches to re-apply
      const matchesToReapply = [...this.matches];
      
      // First ensure counters are reset and recalculated
      this.spellingCount = 0;
      this.grammarCount = 0;
      this.punctuationCount = 0;

      // Recalculate stats from preserved matches
      matchesToReapply.forEach(m => {
        if (m.shortMessage.toLowerCase().includes('drejtshkrimore')) this.spellingCount++;
        if (m.shortMessage.toLowerCase().includes('gramatikore')) this.grammarCount++;
        if (m.shortMessage.toLowerCase().includes('pikë')) this.punctuationCount++;
      });
      
      // Update the UI counters
      this.updateStats();
      
      // Remove all highlights first
      this.boxes.removeSuggestionBoxes();
      
      // Apply each match directly with minimal delay to reduce flickering
      const applyMatches = () => {
        console.log(`Re-applying ${matchesToReapply.length} matches...`);
        
        // Use Delta operations for better performance
        let delta = new Delta();
        let currentIndex = 0;
        
        // Sort matches by offset to process them in order
        const sortedMatches = [...matchesToReapply].sort((a, b) => a.offset - b.offset);
        
        // Build a single delta operation for all formatting
        sortedMatches.forEach(match => {
          if (match.offset < currentIndex) {
            return; // Skip overlapping matches
          }
          
          // Retain up to the match
          if (match.offset > currentIndex) {
            delta.retain(match.offset - currentIndex);
            currentIndex = match.offset;
          }
          
          // Apply the highlight
          delta.retain(match.length, { ltmatch: match });
          currentIndex += match.length;
        });
        
        // Apply the combined operations silently
        if (delta.ops.length > 0) {
          this.quill.updateContents(delta, 'silent');
        }
        
        // Restore selection
        if (selection) {
          this.quill.setSelection(selection.index, selection.length || 0, 'silent');
        }
        
        console.log('All highlights refreshed successfully');
      };
      
      // Use a minimal delay to let Quill finish removing highlights
      setTimeout(applyMatches, 5);
    } catch (error) {
      console.error('Error refreshing highlights:', error);
    }
  }
}

export default function registerQuillDrejtshkruaj(Quill: any) {
  debug("Registering QuillDrejtshkruaj module for Quill instance");
  console.log("Quill inside registerQuillDrejtshkruaj:", Quill); // Debug log
  Quill.register({
    "modules/Drejtshkruaj": QuillDrejtshkruaj,
    "formats/ltmatch": createSuggestionBlotForQuillInstance(Quill),
  });
}

export { getCleanedHtml, removeSuggestionBoxes } from "./SuggestionBoxes";