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

  // Keep track of paragraphs currently being processed to avoid duplicate requests
  private processingParagraphs: Set<number> = new Set();
  // Track paragraph content that was already checked to avoid redundant API calls - using content hash independent of position
  private checkedContent: Map<string, {timestamp: number, matches: MatchesEntity[]}> = new Map();
  // Global check lock to prevent simultaneous API calls
  private apiCallInProgress: boolean = false;
  private apiCallQueue: Array<() => Promise<void>> = [];
  // Debounce mechanism for paragraph checks
  private paragraphDebounces: Map<number, NodeJS.Timeout> = new Map();

  // Add tracking for text changes
  private lastTextChangeTime: number = 0;
  private lastFullCheckTime: number = 0;
  private isRefreshing: boolean = false;
  
  // Track if the editor has been fully initialized and checked
  private hasInitialCheckCompleted: boolean = false;

  // Track paragraphs that have been checked and haven't changed
  private recentlyCheckedParagraphs: Set<number> = new Set();
  
  // Track the most recently sent paragraphs to prevent duplicates
  private recentlySentParagraphs: Set<string> = new Set();
  
  // Track paragraph content with timestamps to prevent duplicates over longer periods
  private paragraphContentTimestamps: Map<string, number> = new Map();
  
  // Track paragraph content hashes that have been processed in this session
  private exactContentProcessed: Map<string, number> = new Map();
  
  // Global rate limiting for API calls
  private lastApiCallTime: number = 0;
  private apiCallCount: number = 0;
  private readonly API_CALL_COOLDOWN: number = 1000; // 1 second between API calls
  private readonly MAX_API_CALLS_PER_MINUTE: number = 30; // 30 calls per minute maximum

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
    
    // Add click handler to trigger spell check when editor is clicked
    this.quill.root.addEventListener('click', this.onEditorClick.bind(this));
    
    // Add focus handler to trigger spell check when editor receives focus
    this.quill.root.addEventListener('focus', this.onEditorFocus.bind(this));
    
    // Disable native spellcheck if requested
    this.disableNativeSpellcheckIfSet();
    
    // Start spell checking with a slight delay to ensure the editor is fully loaded
    setTimeout(() => {
      // Check if we have any text content
      const text = this.quill.getText().trim();
      if (text.length > 0) {
        console.log('Initial text detected, performing full check');
        this.ensureFullTextChecked();
      } else {
        console.log('No initial text detected, waiting for user input');
      }
    }, 500); // 500ms delay to ensure editor is fully initialized
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
    
    // Update the last text change time
    this.lastTextChangeTime = Date.now();

    // Define a small edit threshold - operations affecting just a few characters
    const SMALL_EDIT_THRESHOLD = 3; // Consider edits of 3 or fewer characters as "small"
    let isSmallEdit = true;
    let totalChangeSize = 0;

    // Calculate total size of changes to determine if this is a small edit
    if (delta && delta.ops) {
      delta.ops.forEach((op: any) => {
        if (op.insert) {
          totalChangeSize += typeof op.insert === 'string' ? op.insert.length : 1;
        }
        if (op.delete) {
          totalChangeSize += op.delete;
        }
      });
      
      isSmallEdit = totalChangeSize <= SMALL_EDIT_THRESHOLD;
    }

    // Process the delta to identify which paragraph was modified
    if (delta && delta.ops) {
      let changeStart = 0;
      let hasDelete = false;
      let textDeleted = false;
      let matchesToRemove: MatchesEntity[] = []; // Keep track of matches removed in this delta
      let modifiedParagraphs = new Set<number>(); // Track which paragraphs were modified
      let seenParagraphTexts = new Set<string>(); // Track paragraph texts to avoid duplicates
      
      // Calculate the affected range from delta ops
      delta.ops.forEach((op: any) => {
        if (op.retain) {
          changeStart += op.retain;
        }
        if (op.delete) {
          hasDelete = true;
          textDeleted = true;
          const deleteEnd = changeStart + op.delete;
          
          // Only update matches directly affected by this delete
          // Find matches that are completely within the deleted range
          const matchesInDeletedRange = this.matches.filter(m => 
            m.offset >= changeStart && (m.offset + m.length) <= deleteEnd
          );
          
          // For matches that partially overlap, adjust them rather than removing
          this.matches.forEach(match => {
            // Start is inside deleted range, but end is outside
            if (match.offset >= changeStart && match.offset < deleteEnd && 
                match.offset + match.length > deleteEnd) {
              // Adjust by moving to start of deleted range
              match.offset = changeStart;
              match.length = (match.offset + match.length) - deleteEnd;
            }
            // End is inside deleted range, but start is outside
            else if (match.offset < changeStart && 
                     match.offset + match.length > changeStart &&
                     match.offset + match.length <= deleteEnd) {
              // Truncate to end at start of deleted range
              match.length = changeStart - match.offset;
            }
            // Complete overlap (match contains deletion)
            else if (match.offset < changeStart && 
                    match.offset + match.length > deleteEnd) {
              // Shrink by deleted amount
              match.length -= op.delete;
            }
          });
          
          // Add the completely deleted matches to our removal list
          matchesToRemove.push(...matchesInDeletedRange);
          
          // Remove completely deleted matches from the array
          this.matches = this.matches.filter(m => 
            !(m.offset >= changeStart && (m.offset + m.length) <= deleteEnd)
          );
          
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
          
          // Get paragraph text
          const paragraphText = text.slice(paraStart, paraEnd).trim();
          
          // Only process if this is a new paragraph text we haven't seen
          if (paragraphText && !seenParagraphTexts.has(paragraphText)) {
            seenParagraphTexts.add(paragraphText);
            // Add this paragraph to the modified set
            modifiedParagraphs.add(paraStart);
          
          // For insert operations, calculate the length change
          if (op.insert) {
            const insertLength = typeof op.insert === 'string' ? op.insert.length : 1;
            
              // Only update offsets for matches after the insertion point
              // But KEEP the matches - don't remove them
            this.matches.forEach(match => {
              if (match.offset >= changeStart) {
                match.offset += insertLength;
                } else if (match.offset < changeStart && 
                          match.offset + match.length > changeStart) {
                  // This match spans the insertion point - extend it
                  match.length += insertLength;
                }
              });
            }
            
            // Clear cache for this paragraph so it will be rechecked
          this.clearCacheForRange(paraStart, paraEnd);
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
          if (m.shortMessage?.toLowerCase().includes('drejtshkrimore')) this.spellingCount--;
          if (m.shortMessage?.toLowerCase().includes('gramatikore')) this.grammarCount--;
          if (m.shortMessage?.toLowerCase().includes('pikë')) this.punctuationCount--;
        });
        // Ensure counts don't go below zero
        this.spellingCount = Math.max(0, this.spellingCount);
        this.grammarCount = Math.max(0, this.grammarCount);
        this.punctuationCount = Math.max(0, this.punctuationCount);

        // Immediately update stats display
        this.updateStats(); 
        
        // Call the method to remove ONLY the specific matches that were completely deleted
        if (matchesToRemove.length > 0) {
          // Instead of removing all formatting, just remove specific matches
          this.boxes.removeMatches(matchesToRemove);
        }
        
        // Refresh the matches that were adjusted but not removed
        const adjustedMatches = this.matches.filter(m => 
          (m.offset >= changeStart - 50 && m.offset <= changeStart + 50) ||
          (m.offset + m.length >= changeStart - 50 && m.offset + m.length <= changeStart + 50)
        );
        
        if (adjustedMatches.length > 0) {
          // Reapply formatting for these matches
          adjustedMatches.forEach(match => {
            this.boxes.addSuggestionBoxForMatch(match);
          });
        }
      }
      
      // For small edits (like deleting a space), immediately refresh all matches
      // to ensure they don't disappear
      if (isSmallEdit) {
        // Schedule an immediate refresh of all matches without waiting for debounce
        setTimeout(() => this.refreshVisibleMatches(), 10);
      }
      
      // Check each modified paragraph with appropriate delay
      const text = this.quill.getText();
      
      // For small edits, only schedule recheck of the current paragraph
      if (isSmallEdit) {
        // Find the current paragraph where the change happened
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
        
        if (paraEnd > paraStart) {
          const chunk = {
            text: text.slice(paraStart, paraEnd),
            startOffset: paraStart,
            endOffset: paraEnd,
            index: paraStart
          };
          
          // Use a longer debounce for small edits to avoid flickering
          // BUT don't check during continuous typing to save tokens
          if (this.hasInitialCheckCompleted) {
            // Set a minimum interval between API calls for the same paragraph
            const now = Date.now();
            const contentHash = this.getContentHash(chunk.text);
            const cachedData = this.checkedContent.get(contentHash);
            
            // If we checked this exact content recently, don't recheck
            if (cachedData && (now - cachedData.timestamp < 30000)) {
              console.log(`Skipping API call for recently checked content: ${chunk.text.substring(0, 30)}...`);
            } else {
              // Check if we've checked a similar paragraph text in the last 10 seconds
              // Use a timeout 5 times longer than usual to reduce API calls during typing
              this.checkParagraphSpellingWithDelay(chunk, 4000);
            }
          }
        }
      } else {
        // For larger edits, process all modified paragraphs
        // But only if we've completed the initial check
        if (this.hasInitialCheckCompleted) {
          // Track which paragraph texts we've processed to avoid duplicates
          const processedParagraphTexts = new Set<string>();
          
          modifiedParagraphs.forEach(paraStart => {
            // Find paragraph end
            let paraEnd = paraStart;
            while (paraEnd < text.length && text[paraEnd] !== '\n') {
              paraEnd++;
            }
            
            // Only check if paragraph has content and we haven't processed this text yet
            const paragraphText = text.slice(paraStart, paraEnd).trim();
            if (paragraphText && !processedParagraphTexts.has(paragraphText)) {
              processedParagraphTexts.add(paragraphText);
              
              // Schedule check for this paragraph
              const chunk = {
                text: text.slice(paraStart, paraEnd),
                startOffset: paraStart,
                endOffset: paraEnd,
                index: paraStart
              };
              
              // Use the debounced method with a longer delay
              this.checkParagraphSpelling(chunk);
            }
          });
        }
      }
    }

    // Set cooldown for refreshing formatting
    this.typingCooldown = setTimeout(() => {
      debug("User stopped typing, refreshing formatting");
      // Don't do a full check, just refresh the display
      this.refreshVisibleMatches();
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

    try {
      // Get current text and chunks
      const currentText = this.quill.getText();
      console.log(`Total text length: ${currentText.length} characters`);
      
      // Log a preview of the text to confirm we're processing the correct content
      console.log(`Text preview: ${currentText.substring(0, 100)}...`);
      
      // Get all paragraphs as chunks
      const chunks = TextChunker.getChunks(currentText);
    
      console.log(`Processing ${chunks.length} chunks for spelling check`);
    
      // Force initial stats to zero
      this.spellingCount = 0;
      this.grammarCount = 0;
      this.punctuationCount = 0;

      // If we have no chunks, there's nothing to process
      if (chunks.length === 0) {
        console.warn("No text chunks found to process!");
        this.loader.stopLoading();
        return Promise.resolve();
      }
      
      // Process chunks sequentially - one at a time
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Processing chunk ${i+1}/${chunks.length}`);
        
        // Process this chunk and wait for completion
        await this.processChunk(chunk);
        
        // Add a small delay between chunks to ensure UI updates
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // After all chunks are processed, refresh all suggestions to ensure they're visible
      console.log("All chunks processed. Refreshing all matches...");
      this.refreshVisibleMatches();
      
      // Update stats now that all paragraphs are processed
      this.updateStats();
      
      console.log("Spelling check complete!");
    } catch (error) {
      console.error("Error during spelling check:", error);
    } finally {
      this.loader.stopLoading();
    }
    
    // Return a promise that resolves when the operation is complete
    return Promise.resolve();
  }
  
  // Process a single chunk - simplified helper method
  private async processChunk(chunk: { text: string, startOffset: number, endOffset: number, index: number }) {
    try {
      const trimmedText = chunk.text.trim();
      if (!trimmedText) {
        console.log(`Skipping empty chunk at index ${chunk.index}`);
        return;
      }
      
      console.log(`Processing chunk ${chunk.index} (${chunk.startOffset}-${chunk.endOffset}): "${trimmedText.substring(0, 30)}..."`);
      
      // Get content hash
      const contentHash = this.getContentHash(chunk.text);
      
      // Get exact content hash for stricter deduplication
      const exactHash = this.getExactContentHash(chunk.text);
      
      // Check if we've already processed this exact content
      const lastProcessedTime = this.exactContentProcessed.get(exactHash);
      if (lastProcessedTime) {
        const now = Date.now();
        const timeSinceLastProcessed = now - lastProcessedTime;
        
        // If we've processed this exact content within the last 10 seconds, skip it entirely
        if (timeSinceLastProcessed < 10000) {
          console.log(`Exact content processed ${timeSinceLastProcessed}ms ago, skipping: ${trimmedText.substring(0, 30)}...`);
          return;
        }
      }

      // Check if we just sent this exact text to the API (duplicate prevention)
      if (this.recentlySentParagraphs.has(contentHash)) {
        console.log(`Duplicate paragraph text detected, skipping: ${trimmedText.substring(0, 30)}...`);
        return;
      }
      
      // Check if we've processed this exact content recently (with longer timeout)
      const now = Date.now();
      const contentCacheTime = this.paragraphContentTimestamps.get(contentHash);
      if (contentCacheTime && (now - contentCacheTime < 60000)) { // 60 second tracking
        console.log(`Paragraph content processed recently, skipping duplicate: ${trimmedText.substring(0, 30)}...`);
        return;
      }
      
      // Clear any existing debounce for this paragraph
      if (this.paragraphDebounces.has(chunk.index)) {
        clearTimeout(this.paragraphDebounces.get(chunk.index));
      }
      
      // Set debounce to avoid rapid successive checks of the same paragraph
      this.paragraphDebounces.set(chunk.index, setTimeout(async () => {
        // The rest of the implementation is the same as checkParagraphSpelling
        // Get content hash that's independent of paragraph position
        const contentHash = this.getContentHash(chunk.text);
        const cachedData = this.checkedContent.get(contentHash);
        const now = Date.now();
        
        // If we recently checked this exact content, reuse the results
        if (cachedData && (now - cachedData.timestamp < 30000)) { // 30 second cache
          console.log(`Using cached results for: ${trimmedText.substring(0, 30)}...`);
          
          // Find existing matches in this range
          const existingMatchesInRange = this.matches.filter(m => 
            m.offset >= chunk.startOffset && m.offset < chunk.endOffset
          );
          
          // Only update if we have existing matches to replace or new ones to add
          if (existingMatchesInRange.length > 0 || cachedData.matches.length > 0) {
            // First remove the existing formatting for matches in this range
            if (existingMatchesInRange.length > 0) {
              // Remove these specific matches instead of removing all formatting in range
              this.boxes.removeMatches(existingMatchesInRange);
              
              // Now remove from the matches array
              this.matches = this.matches.filter(m => 
                !(m.offset >= chunk.startOffset && m.offset < chunk.endOffset)
              );
            }
            
            // Add cached matches with adjusted offsets
            const adjustedMatches = cachedData.matches.map(match => ({
              ...match,
              offset: match.offset - (match.originalOffset || 0) + chunk.startOffset
            }));
            
            this.matches.push(...adjustedMatches);
            
            // Update highlights for this paragraph only
            adjustedMatches.forEach(match => {
              this.boxes.addSuggestionBoxForMatch(match);
            });
          }
          
          // Mark this paragraph as recently checked
          this.recentlyCheckedParagraphs.add(chunk.index);
          
          return;
        }
        
        // Queue this API call to avoid simultaneous requests
        this.apiCallQueue.push(async () => {
          // Track this paragraph as being sent to the API
          this.trackParagraphSent(contentHash, chunk.text);

          // Track this exact content
          this.exactContentProcessed.set(exactHash, Date.now());
          
          // Double check the content hash hasn't been checked by a different paragraph
          // while this was in the queue
          const recheckCachedData = this.checkedContent.get(contentHash);
          if (recheckCachedData && (now - recheckCachedData.timestamp < 30000)) {
            console.log(`Content already checked while in queue: ${trimmedText.substring(0, 30)}...`);
            return;
          }
          
          // Mark paragraph as being processed
          this.processingParagraphs.add(chunk.index);
          
          try {
      this.loader.startLoading();
      
      const json = await this.getDrejtshkruajResults(chunk.text);
      
      if (json && json.matches) {
              // Find existing matches in this range
        const matchesToRemove = this.matches.filter(m => 
          m.offset >= chunk.startOffset && m.offset < chunk.endOffset
        );
        
              // Only process if we have new matches to add or existing ones to remove
              // For rate limit errors, json.matches will be empty, so we won't remove existing matches
              if (matchesToRemove.length > 0 || json.matches.length > 0) {
        // Update stats counter for removed matches
        matchesToRemove.forEach(m => {
                  if (m.shortMessage?.toLowerCase().includes('drejtshkrimore')) this.spellingCount--;
                  if (m.shortMessage?.toLowerCase().includes('gramatikore')) this.grammarCount--;
                  if (m.shortMessage?.toLowerCase().includes('pikë')) this.punctuationCount--;
                });
                
                // Remove the existing formatting for matches in this range
                if (matchesToRemove.length > 0 && json.matches.length > 0) {
                  // Only remove existing matches if we have new ones to add
                  // This prevents clearing suggestions when rate limited
                  this.boxes.removeMatches(matchesToRemove);
                  
                  // Now remove from the matches array
        this.matches = this.matches.filter(m => 
          !(m.offset >= chunk.startOffset && m.offset < chunk.endOffset)
        );
                }
          
                // Add new matches with adjusted offsets and store original offset for caching
                if (json.matches.length > 0) {
        const adjustedMatches = json.matches.map(match => ({
          ...match,
                    originalOffset: match.offset, // Store original offset for future repositioning
          offset: match.offset + chunk.startOffset
        }));
        
        this.matches.push(...adjustedMatches);
                  
                  // Store in content cache
                  this.checkedContent.set(contentHash, {
                    timestamp: now,
                    matches: adjustedMatches
                  });
        
        // Update stats counter for new matches
        adjustedMatches.forEach(m => {
                    if (m.shortMessage?.toLowerCase().includes('drejtshkrimore')) this.spellingCount++;
                    if (m.shortMessage?.toLowerCase().includes('gramatikore')) this.grammarCount++;
                    if (m.shortMessage?.toLowerCase().includes('pikë')) this.punctuationCount++;
        });
        
        console.log(`Added ${adjustedMatches.length} matches for paragraph at offset ${chunk.startOffset}`);
                  
                  // Update highlights for this paragraph only
                  adjustedMatches.forEach(match => {
                    this.boxes.addSuggestionBoxForMatch(match);
                  });
                }
              }
      }
      
      // Update cache
      this.paragraphCache.set(chunk.index, { text: chunk.text, startOffset: chunk.startOffset });
            
            // Mark this paragraph as recently checked
            this.recentlyCheckedParagraphs.add(chunk.index);
            
        // Update stats
        this.updateStats();
          } catch (error) {
            console.error('Error processing paragraph:', error);
            // Don't let errors in one paragraph affect the others
            // or cause suggestions to disappear
          } finally {
            // Release the processing lock
            this.processingParagraphs.delete(chunk.index);
            this.loader.stopLoading();
          }
        });
        
        // Process the queue
        this.processApiCallQueue();
      }, 4000)); // Use a fixed delay value
    } catch (error) {
      console.error('Error in checkParagraphSpellingWithDelay:', error);
      if (chunk.index !== undefined) {
        this.processingParagraphs.delete(chunk.index);
      }
      this.loader.stopLoading();
    }
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
      
      // Handle rate limiting errors
      if (response.status === 429) {
        console.error("Rate limit exceeded. Waiting before retrying.");
        // Show rate limit message to the user
        this.loader.showRateLimitMessage();
        // Don't clear existing suggestions - just return empty results
        // to prevent suggestions from disappearing
        return { matches: [] };
      }
      
      if (!response.ok) {
        console.error(`API request failed with status: ${response.status}`);
        // Return empty results rather than null to prevent suggestion disappearance
        return { matches: [] };
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
      // Return empty results instead of null to avoid clearing suggestions
      return { matches: [] };
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

  // Process the API call queue
  private async processApiCallQueue() {
    if (this.apiCallInProgress || this.apiCallQueue.length === 0) return;
    
    // Add rate limiting
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCallTime;
    
    // If we've made too many calls in the last minute, slow down
    if (this.apiCallCount >= this.MAX_API_CALLS_PER_MINUTE) {
      console.log(`Rate limiting: Made ${this.apiCallCount} API calls already, waiting longer...`);
      // Wait at least 2 seconds if we're approaching rate limits
      setTimeout(() => this.processApiCallQueue(), 2000);
      return;
    }
    
    // Make sure we're not calling the API too frequently
    if (timeSinceLastCall < this.API_CALL_COOLDOWN) {
      console.log(`Rate limiting: Only ${timeSinceLastCall}ms since last API call, waiting...`);
      setTimeout(() => this.processApiCallQueue(), this.API_CALL_COOLDOWN - timeSinceLastCall);
      return;
    }
    
    this.apiCallInProgress = true;
    try {
      const nextCall = this.apiCallQueue.shift();
      if (nextCall) {
        // Update tracking for rate limiting
        this.lastApiCallTime = Date.now();
        this.apiCallCount++;
        
        // After 60 seconds, decrement the counter
        setTimeout(() => {
          this.apiCallCount = Math.max(0, this.apiCallCount - 1);
        }, 60000);
        
        await nextCall();
      }
    } catch (error) {
      console.error("Error processing API call queue:", error);
      // Don't let errors in queue processing break the entire system
    } finally {
      this.apiCallInProgress = false;
      // Process next item in queue if any - with a delay to prevent rapid consecutive calls
      if (this.apiCallQueue.length > 0) {
        setTimeout(() => this.processApiCallQueue(), 300);
      }
    }
  }

  // Helper to get a content hash independent of paragraph position
  private getContentHash(text: string): string {
    return text.trim();
  }

  // Get an exact match hash that's even more strict for deduplication
  private getExactContentHash(text: string): string {
    // Remove all whitespace and make lowercase for stricter matching
    return text.trim().toLowerCase().replace(/\s+/g, '');
  }

  // Checks spelling for a single paragraph chunk
  private async checkParagraphSpelling(chunk: { text: string, startOffset: number, endOffset: number, index: number }) {
    try {
      const trimmedText = chunk.text.trim();
      if (!trimmedText) return;
      
      // If index was not set (like when calling from onTextChange), calculate it
      if (chunk.index === -1) {
        // Use the paragraph offset to determine a unique index
        chunk.index = chunk.startOffset;
      }
      
      // Get exact content hash for stricter deduplication
      const exactHash = this.getExactContentHash(chunk.text);
      
      // Check if we've already processed this exact content
      const lastProcessedTime = this.exactContentProcessed.get(exactHash);
      if (lastProcessedTime) {
        const now = Date.now();
        const timeSinceLastProcessed = now - lastProcessedTime;
        
        // If we've processed this exact content within the last 10 seconds, skip it entirely
        if (timeSinceLastProcessed < 10000) {
          console.log(`Exact content processed ${timeSinceLastProcessed}ms ago, skipping: ${trimmedText.substring(0, 30)}...`);
          return;
        }
      }
      
      // Check if this exact paragraph is already being processed
      if (this.processingParagraphs.has(chunk.index)) {
        console.log(`Paragraph ${chunk.index} already being processed, skipping`);
        return;
      }
      
      // Get content hash that's independent of paragraph position
      const contentHash = this.getContentHash(chunk.text);
      
      // Check if this paragraph was recently checked (and its content didn't change)
      const cachedParagraph = this.paragraphCache.get(chunk.index);
      if (cachedParagraph && cachedParagraph.text === chunk.text && this.recentlyCheckedParagraphs.has(chunk.index)) {
        console.log(`Paragraph ${chunk.index} was recently checked and content didn't change, skipping`);
        return;
      }
      
      // Check if we just sent this exact text to the API (duplicate prevention)
      if (this.recentlySentParagraphs.has(contentHash)) {
        console.log(`Duplicate paragraph text detected, skipping: ${trimmedText.substring(0, 30)}...`);
        return;
      }
      
      // Check if we've processed this exact content recently (with longer timeout)
      const now = Date.now();
      const contentCacheTime = this.paragraphContentTimestamps.get(contentHash);
      if (contentCacheTime && (now - contentCacheTime < 60000)) { // 60 second tracking
        console.log(`Paragraph content processed recently, skipping duplicate: ${trimmedText.substring(0, 30)}...`);
        return;
      }
      
      // Clear any existing debounce for this paragraph
      if (this.paragraphDebounces.has(chunk.index)) {
        clearTimeout(this.paragraphDebounces.get(chunk.index));
      }
      
      // Set debounce to avoid rapid successive checks of the same paragraph
      this.paragraphDebounces.set(chunk.index, setTimeout(async () => {
        // Delegate to the regular check method
        this.checkParagraphSpelling(chunk);
      }, 4000)); // Fixed delay of 4000ms
    } catch (error) {
      console.error('Error in checkParagraphSpelling:', error);
      if (chunk.index !== undefined) {
        this.processingParagraphs.delete(chunk.index);
      }
    }
  }

  // Enhance the refreshVisibleMatches method to be more reliable with small edits
  private refreshVisibleMatches() {
    try {
      console.log('Refreshing visible matches without disturbing other paragraphs...');
      
      // Copy the current matches to work with
      const allMatches = [...this.matches];
      
      // Get current text
      const text = this.quill.getText();
      
      // Verify and adjust match positions if needed
      allMatches.forEach(match => {
        // Check if the match exists and has valid offset/length
        if (match && typeof match.offset === 'number' && typeof match.length === 'number') {
          // Make sure match is within text bounds
          if (match.offset < 0 || match.offset + match.length > text.length) {
            console.warn('Match out of bounds, not refreshing:', match);
            return;
          }
          
          // If the match has a wordform, verify it matches the actual text
          if (match.wordform) {
            const currentText = text.substring(match.offset, match.offset + match.length).trim();
            
            // If text doesn't match the wordform, try to find it nearby
            if (currentText !== match.wordform) {
              // Search for the word in a range around the expected position
              const searchStart = Math.max(0, match.offset - 30);
              const searchEnd = Math.min(text.length, match.offset + match.length + 30);
              const searchText = text.substring(searchStart, searchEnd);
              
              const wordIndex = searchText.indexOf(match.wordform);
              if (wordIndex !== -1) {
                // Found it - update the position
                const newOffset = searchStart + wordIndex;
                match.offset = newOffset;
                match.length = match.wordform.length;
              }
            }
          }
          
          // Apply the match formatting (will handle any position updates)
          this.boxes.addSuggestionBoxForMatch(match);
        }
      });
      
      // Update stats
      this.updateStats();
    } catch (error) {
      console.error('Error refreshing visible matches:', error);
    }
  }

  // Handler for editor click events
  private onEditorClick(event: MouseEvent) {
    // Check if it's been at least 5 seconds since the last full check
    const now = Date.now();
    const timeSinceLastCheck = now - (this.lastFullCheckTime || 0);
    
    // Only trigger a check if we haven't checked recently and there's actual text
    if (timeSinceLastCheck > 5000 && this.quill.getText().trim().length > 0) {
      console.log('Editor clicked, triggering full spell check');
      // Schedule the check with a small delay to avoid disrupting the user
      setTimeout(() => this.ensureFullTextChecked(), 100);
    }
  }
  
  // Handler for editor focus events
  private onEditorFocus(event: FocusEvent) {
    // Check if it's been at least 10 seconds since the last full check
    const now = Date.now();
    const timeSinceLastCheck = now - (this.lastFullCheckTime || 0);
    
    // Only trigger a check if we haven't checked recently and there's actual text
    if (timeSinceLastCheck > 10000 && this.quill.getText().trim().length > 0) {
      console.log('Editor focused, triggering full spell check');
      // Schedule the check with a small delay
      setTimeout(() => this.ensureFullTextChecked(), 100);
    }
  }

  // Method to ensure full text is checked
  private ensureFullTextChecked() {
    // Perform a complete check of the entire text
    console.log('Ensuring all paragraphs are checked');
    
    // This is a full initialization - check all paragraphs once
    if (!this.hasInitialCheckCompleted) {
      // Clear any existing data to force a fresh check
      this.matches = [];
      this.paragraphCache.clear();
      this.checkedContent.clear();
      
      // Perform a full spelling check, but one paragraph at a time
      this.checkUncachedParagraphs().then(() => {
        console.log('Initial full check completed');
        this.hasInitialCheckCompleted = true;
        this.lastFullCheckTime = Date.now();
      }).catch(error => {
        console.error('Error during initial check:', error);
      });
    } else {
      // For subsequent checks, only check paragraphs that don't have cached results
      console.log('Checking only uncached paragraphs');
      this.checkUncachedParagraphs();
    }
  }

  // Updated method to check only paragraphs without cached results - sequentially
  private async checkUncachedParagraphs() {
    if (document.querySelector("lt-toolbar")) {
      debug("Drejtshkruaj is installed as extension, not checking");
      return;
    }

    debug("Checking uncached paragraphs");
    this.loader.startLoading();

    try {
      // Get current text and chunks
      const currentText = this.quill.getText();
      console.log(`Total text length: ${currentText.length} characters`);
      
      // Get all paragraphs as chunks
      const chunks = TextChunker.getChunks(currentText);
      console.log(`Found ${chunks.length} total paragraphs`);
      
      // Filter to only check paragraphs that don't have recent cached results
      const now = Date.now();
      const uncachedChunks = chunks.filter(chunk => {
        const contentHash = this.getContentHash(chunk.text);
        const cachedData = this.checkedContent.get(contentHash);
        
        // If no cache or cache is older than 5 minutes, check this paragraph
        return !cachedData || (now - cachedData.timestamp > 300000);
      });
      
      console.log(`Processing only ${uncachedChunks.length} uncached paragraphs out of ${chunks.length} total`);
      
      if (uncachedChunks.length === 0) {
        console.log('All paragraphs are cached, no need for API calls');
        this.loader.stopLoading();
        return Promise.resolve();
      }
      
      // Process chunks one at a time, waiting for each to complete
      for (let i = 0; i < uncachedChunks.length; i++) {
        const chunk = uncachedChunks[i];
        console.log(`Processing uncached chunk ${i+1}/${uncachedChunks.length}`);
        
        // Process this chunk and wait for it to complete
        await this.processChunk(chunk);
        
        // Brief delay between chunks to ensure UI can update
        if (i < uncachedChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Update stats after all paragraphs are processed
      this.updateStats();
      
      console.log("Uncached paragraphs check complete!");
      this.lastFullCheckTime = Date.now();
    } catch (error) {
      console.error("Error during uncached paragraphs check:", error);
    } finally {
      this.loader.stopLoading();
    }
    
    // Return a promise that resolves when the operation is complete
    return Promise.resolve();
  }

  // Helper to log when paragraph is actually sent to API and track content
  private trackParagraphSent(contentHash: string, text: string) {
    console.log(`🔄 SENDING TO API: ${text.substring(0, 30)}...`);
    
    // Add to recently sent set (short-term tracking)
    this.recentlySentParagraphs.add(contentHash);
    
    // Remove from set after 10 seconds to prevent memory buildup
    setTimeout(() => {
      this.recentlySentParagraphs.delete(contentHash);
    }, 10000);
    
    // Add to content timestamps map (longer-term tracking)
    this.paragraphContentTimestamps.set(contentHash, Date.now());
    
    // Clean up old entries from the timestamps map after 2 minutes
    setTimeout(() => {
      this.paragraphContentTimestamps.delete(contentHash);
    }, 120000);
    
    // Also track with exact content hash for even stricter deduplication
    const exactHash = this.getExactContentHash(text);
    this.exactContentProcessed.set(exactHash, Date.now());
  }

  // Clear cache methods to handle changes
  private clearCache() {
    this.paragraphCache.clear();
    this.checkedContent.clear();
    this.recentlyCheckedParagraphs.clear();
    this.recentlySentParagraphs.clear();
    this.paragraphContentTimestamps.clear();
    this.exactContentProcessed.clear();
  }

  // Improved clear cache for range to also invalidate content hash
  private clearCacheForRange(start: number, end: number) {
    const text = this.quill.getText();
    const chunks = TextChunker.getChunks(text);
    
    for (const chunk of chunks) {
      // If the chunk overlaps with [start, end], clear its cache entry
      if (!(chunk.endOffset < start || chunk.startOffset > end)) {
        this.paragraphCache.delete(chunk.index);
        this.recentlyCheckedParagraphs.delete(chunk.index);
        
        // Also invalidate content hash
        const contentHash = this.getContentHash(chunk.text);
        this.checkedContent.delete(contentHash);
        this.paragraphContentTimestamps.delete(contentHash);
      }
    }
  }

  // Add an onKey handler to handle space key more aggressively
  private addSpaceKeyHandler() {
    // Add direct event listener for space key to stop highlight stretching
    this.quill.root.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
      }
    });
  }

  // Helper method to update UI for a paragraph
  private updateUIForParagraph(chunk: { startOffset: number, endOffset: number }) {
    try {
      // Update stats
      this.updateStats();
    } catch (error) {
      console.error('Error updating UI for paragraph:', error);
    }
  }

  // Method to handle paragraph spelling check with a custom delay
  private checkParagraphSpellingWithDelay(chunk: { text: string, startOffset: number, endOffset: number, index: number }, _delayMs: number) {
    try {
      const trimmedText = chunk.text.trim();
      if (!trimmedText) return;
      
      // If index was not set (like when calling from onTextChange), calculate it
      if (chunk.index === -1) {
        // Use the paragraph offset to determine a unique index
        chunk.index = chunk.startOffset;
      }
      
      // Check if this exact paragraph is already being processed
      if (this.processingParagraphs.has(chunk.index)) {
        console.log(`Paragraph ${chunk.index} already being processed, skipping`);
        return;
      }
      
      // Get content hash that's independent of paragraph position
      const contentHash = this.getContentHash(chunk.text);
      
      // Get exact content hash for stricter deduplication
      const exactHash = this.getExactContentHash(chunk.text);
      
      // Check if this paragraph was recently checked (and its content didn't change)
      const cachedParagraph = this.paragraphCache.get(chunk.index);
      if (cachedParagraph && cachedParagraph.text === chunk.text && this.recentlyCheckedParagraphs.has(chunk.index)) {
        console.log(`Paragraph ${chunk.index} was recently checked and content didn't change, skipping`);
        return;
      }
      
      // Check if we just sent this exact text to the API (duplicate prevention)
      if (this.recentlySentParagraphs.has(contentHash)) {
        console.log(`Duplicate paragraph text detected, skipping: ${trimmedText.substring(0, 30)}...`);
        return;
      }
      
      // Check if we've processed this exact content recently (with longer timeout)
      const now = Date.now();
      const contentCacheTime = this.paragraphContentTimestamps.get(contentHash);
      if (contentCacheTime && (now - contentCacheTime < 60000)) { // 60 second tracking
        console.log(`Paragraph content processed recently, skipping duplicate: ${trimmedText.substring(0, 30)}...`);
        return;
      }
      
      // Clear any existing debounce for this paragraph
      if (this.paragraphDebounces.has(chunk.index)) {
        clearTimeout(this.paragraphDebounces.get(chunk.index));
      }
      
      // Schedule check with a longer timeout to prevent excessive API calls
      this.paragraphDebounces.set(chunk.index, setTimeout(() => {
        // Delegate to the regular check method
        this.checkParagraphSpelling(chunk);
      }, 4000)); // Fixed delay of 4000ms
    } catch (error) {
      console.error('Error in checkParagraphSpellingWithDelay:', error);
      if (chunk.index !== undefined) {
        this.processingParagraphs.delete(chunk.index);
      }
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