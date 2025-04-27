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
    
    this.quill.on("text-change", (_delta, _oldDelta, source) => {
      if (source === "user") {
        this.onTextChange(_delta);
      }
    });
    
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

    // Clear cache for modified range
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
          
          // Clear cache for this paragraph
          this.clearCacheForRange(paraStart, paraEnd);
          
          console.log('Cleared cache for range:', {
            paraStart,
            paraEnd,
            text: text.slice(paraStart, paraEnd)
          });
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
      this.checkSpelling(); // This needs to recalculate counts correctly
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
    let currentMatches: MatchesEntity[] = []; // Build matches locally first

    for (const chunk of chunks) {
      const cachedEntry = this.paragraphCache.get(chunk.index);
      
      if (cachedEntry && cachedEntry.text === chunk.text) {
        // Paragraph unchanged, but update match offsets if the paragraph shifted
        const offsetDiff = chunk.startOffset - cachedEntry.startOffset;
        if (offsetDiff !== 0) {
          this.matches.forEach(match => {
            if (match.offset >= cachedEntry.startOffset && (match.offset + match.length) <= (cachedEntry.startOffset + cachedEntry.text.length + 1)) {
              match.offset += offsetDiff;
            }
          });
        }
        // Update cache with new start offset
        this.paragraphCache.set(chunk.index, { text: chunk.text, startOffset: chunk.startOffset });
        // Update suggestion boxes for unchanged paragraph
        this.boxes.updateSuggestionBoxesForRange(chunk.startOffset, chunk.endOffset);
        // Update stats after each chunk
        this.updateStats();
        continue;
      }
      
      console.log('Processing changed chunk:', {
        offset: chunk.startOffset,
        text: chunk.text.substring(0, 50) + '...'
      });
      
      // Process this chunk if it's non-empty
      if (chunk.text.trim()) {
        const json = await this.getDrejtshkruajResults(chunk.text);
        
        if (json && json.matches) {
          // Add new matches with adjusted offsets to the temporary list
          const adjustedMatches = json.matches.map(match => ({
            ...match,
            offset: match.offset + chunk.startOffset
          }));
          currentMatches.push(...adjustedMatches);
        } else {
          // If API fails or returns no matches for a chunk that existed before, 
          // ensure we retain existing matches for that chunk from the cache logic if needed.
          // (More complex logic might be needed here if API is unreliable)
        }
      } else {
         // If chunk is empty, ensure matches previously in this range are removed
         // (This might need more careful handling based on cache logic)
      }
      
      // Update cache
      this.paragraphCache.set(chunk.index, { text: chunk.text, startOffset: chunk.startOffset });
    }

    // Replace old matches with the newly built list
    this.matches = currentMatches;

    // Recalculate counts based on the final matches list
    this.matches.forEach(m => {
      if (m.shortMessage.toLowerCase().includes('drejtshkrimore')) this.spellingCount++;
      if (m.shortMessage.toLowerCase().includes('gramatikore')) this.grammarCount++;
      if (m.shortMessage.toLowerCase().includes('pikë')) this.punctuationCount++;
    });

    // Update boxes based on the final matches
    this.boxes.removeSuggestionBoxes(); // Clear old ones first
    this.boxes.addSuggestionBoxes();    // Add new ones

    // Final stats update at the end
    this.updateStats();
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
    const sidebarTarget = document.querySelector('.right-sidebar .stats-panel-container');

    if (!sidebarTarget) {
      console.error("QuillDrejtshkruaj Error: Could not find the .stats-panel-container element within .right-sidebar. Stats panel cannot be attached.");
      return;
    }

    // Clear any existing placeholder content in the target container
    sidebarTarget.innerHTML = ''; 

    // Create the stats panel content (HTML string remains the same)
    const statsContentHTML = `
      <div class="right-stats-panel"> 
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

    // Inject the stats panel HTML into the specific target container
    sidebarTarget.innerHTML = statsContentHTML;
    
  }

  public updateStats() {
    // Selectors need to target elements within the container now
    const spellingCounter = document.querySelector('.right-sidebar .stats-panel-container .counter-spelling .counter-value');
    const grammarCounter = document.querySelector('.right-sidebar .stats-panel-container .counter-grammar .counter-value');
    const punctuationCounter = document.querySelector('.right-sidebar .stats-panel-container .counter-punctuation .counter-value');
    const totalCounter = document.querySelector('.right-sidebar .stats-panel-container .counter-total .counter-value');

    if (spellingCounter) spellingCounter.textContent = this.spellingCount.toString();
    if (grammarCounter) grammarCounter.textContent = this.grammarCount.toString();
    if (punctuationCounter) punctuationCounter.textContent = this.punctuationCount.toString();
    if (totalCounter) totalCounter.textContent = (this.spellingCount + this.grammarCount + this.punctuationCount).toString();
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