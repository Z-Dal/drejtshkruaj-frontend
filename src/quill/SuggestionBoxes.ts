import debug from "../utils/debug";
import Delta from "quill-delta";
import type Quill from "quill";
import { QuillDrejtshkruaj } from "./quillDrejtshkruaj";
import { MatchesEntity } from "../types";

/**
 * Clean all suggestion boxes from an HTML string
 *
 * @param html HTML to clean
 * @returns Cleaned text
 */
export function getCleanedHtml(html: string) {
  return html.replace(/<quill-lt-match .+?>(.*?)<\/quill-lt-match>/g, "$1");
}


/**
 * Remove all suggestion boxes from the editor.
 */
export function removeSuggestionBoxes(quillEditor: Quill) {
  debug("Removing suggestion boxes for editor", quillEditor);

  const initialSelection = quillEditor.getSelection();
  const deltas = quillEditor.getContents();

  const deltasWithoutSuggestionBoxes = deltas.ops.map((delta) => {
    if (delta.attributes && delta.attributes.ltmatch) {
      return {
        ...delta,
        attributes: {
          ...delta.attributes,
          ltmatch: null,
        },
      };
    }
    return delta;
  });

  // @ts-ignore
  quillEditor.setContents(new Delta(deltasWithoutSuggestionBoxes));

  if (initialSelection) {
    quillEditor.setSelection(initialSelection);
  }
}

/**
 * Manager for the suggestion boxes.
 * This handles inserting and removing suggestion box elements from the editor.
 */
export class SuggestionBoxes {
  constructor(private readonly parent: QuillDrejtshkruaj) {}

  /**
   * Remove all suggestion boxes from the editor.
   */
  public removeSuggestionBoxes() {
    this.parent.preventLoop();
    removeSuggestionBoxes(this.parent.quill);
  }

  /**
   * Removes the formatting for a specific list of matches using a single Delta.
   *
   * @param matchesToRemove The matches whose highlights should be removed.
   */
  public removeMatches(matchesToRemove: MatchesEntity[]) {
    if (!matchesToRemove || matchesToRemove.length === 0) {
      return; // Nothing to remove
    }

    debug("Removing specific matches via Delta:", matchesToRemove.length);
    this.parent.preventLoop(); // Prevent immediate re-check loops

    const quill = this.parent.quill;
    let delta = new Delta();
    let currentIndex = 0;

    // Sort matches by offset to process them in order
    const sortedMatches = [...matchesToRemove].sort((a, b) => a.offset - b.offset);

    sortedMatches.forEach(match => {
       if (match.offset < currentIndex) {
         // This might happen if matches overlap or offsets are weird after previous ops
         // Skip this match to avoid delta errors, though this indicates a potential issue elsewhere
         console.warn("Skipping overlapping/out-of-order match during removal:", match);
         return;
       }
      // Retain up to the start of the match
      delta.retain(match.offset - currentIndex);
      // Retain the length of the match, but remove the format
      delta.retain(match.length, { ltmatch: null }); // Use null to remove attribute
      // Update the current index
      currentIndex = match.offset + match.length;
    });

    // Apply the combined delta silently
    if (delta.ops.length > 0) {
        quill.updateContents(delta, 'silent');
    }
    
    // Note: We don't need to update this.parent.matches here, 
    // as that was already done in onTextChange before calling this method.
  }

  /**
   * Insert a suggestion box into the editor.
   *
   * This uses the matches stored in the parent class
   */
  public addSuggestionBoxes() {
    const updatedMatches: MatchesEntity[] = [];

    this.parent.matches.forEach((match) => {
      this.parent.preventLoop();
      const text = this.parent.quill.getText();

      if (match.action === 'insert') {
        // For insert action, find the context word
        const textBefore = text.slice(Math.max(0, match.offset - 20), match.offset);
        const textAfter = text.slice(match.offset, Math.min(text.length, match.offset + 20));
        
        // Find word boundaries
        const beforeWords = textBefore.trim().split(/\s+/);
        const afterWords = textAfter.trim().split(/\s+/);
        
        const beforeWord = beforeWords[beforeWords.length - 1];
        const afterWord = afterWords[0];
        
        let contextWord: string | undefined;
        let contextOffset = 0;
        let contextLength = 0;
        let insertPosition: 'before' | 'after' | undefined;
        
        if (afterWord) {
          // Prefer using the following word if available
          contextWord = afterWord;
          const foundOffset = text.indexOf(afterWord, match.offset);
          if (foundOffset !== -1) {
            contextOffset = foundOffset;
            contextLength = afterWord.length;
            insertPosition = 'before';
          }
        } else if (beforeWord) {
          // Fall back to preceding word
          contextWord = beforeWord;
          const foundOffset = text.lastIndexOf(beforeWord, match.offset);
          if (foundOffset !== -1) {
            contextOffset = foundOffset;
            contextLength = beforeWord.length;
            insertPosition = 'after';
          }
        }

        if (contextWord && insertPosition) {
          const updatedMatch: MatchesEntity = {
            ...match,
            contextWord,
            insertPosition,
            offset: contextOffset,
            length: contextLength,
            suggestions: [{
              value: insertPosition === 'before' ? 
                `${match.suggestions[0].value} ${contextWord}` :
                `${contextWord} ${match.suggestions[0].value}`
            }]
          };

          const ops = new Delta()
            .retain(contextOffset)
            .retain(contextLength, { 
              ltmatch: updatedMatch,
              class: 'insert-context'
            });
          
          this.parent.quill.updateContents(ops);
          updatedMatches.push(updatedMatch);
        }
      } else {
        // Handle other cases as before
        let wordToHighlight = text.slice(match.offset, match.offset + match.length);
        
        if (wordToHighlight.trim() === match.wordform) {
          const ops = new Delta()
            .retain(match.offset)
            .retain(match.length, { ltmatch: match });
          
          this.parent.quill.updateContents(ops);
          updatedMatches.push(match);
        } else {
          console.log('Exact match failed, searching in range');
          const searchStart = Math.max(0, match.offset - 50);
          const searchEnd = Math.min(text.length, match.offset + match.length + 50);
          const textToSearch = text.slice(searchStart, searchEnd);
          
          console.log('Search details:', {
            searchStart,
            searchEnd,
            textToSearch,
            wordform: match.wordform
          });

          const wordIndex = textToSearch.indexOf(match.wordform);
          if (wordIndex !== -1) {
            const actualOffset = searchStart + wordIndex;
            console.log('Found word at new offset:', actualOffset);
            
            const updatedMatch = {
              ...match,
              offset: actualOffset,
              length: match.wordform.length
            };

            const ops = new Delta()
              .retain(actualOffset)
              .retain(match.wordform.length, { ltmatch: updatedMatch });
            
            this.parent.quill.updateContents(ops);
            updatedMatches.push(updatedMatch);
          } else {
            console.warn('Word not found:', {
              wordform: match.wordform,
              searchText: textToSearch
            });
          }
        }
      }
    });

    this.parent.matches = updatedMatches;
  }

  public updateSuggestionBoxesForRange(startOffset: number, endOffset: number): void {
    try {
      // Validate parameters
      if (startOffset === undefined || endOffset === undefined || 
          startOffset < 0 || endOffset < startOffset) {
        console.warn('Invalid range in updateSuggestionBoxesForRange:', {startOffset, endOffset});
        return;
      }
      
      // Validate range is within document bounds
      const textLength = this.parent.quill.getText().length;
      if (startOffset > textLength) {
        console.warn('Range start out of bounds:', startOffset, 'text length:', textLength);
        return;
      }
      
      // Adjust endOffset if needed to prevent going beyond text bounds
      const safeEndOffset = Math.min(endOffset, textLength);
      const range = safeEndOffset - startOffset;
      
      // Only proceed if range is positive
      if (range <= 0) {
        console.warn('Empty or invalid range in updateSuggestionBoxesForRange');
        return;
      }
      
      // Remove suggestion boxes formatting in the specified range (with error handling)
      try {
        this.parent.preventLoop();
        this.parent.quill.formatText(startOffset, range, 'ltmatch', false, 'silent');
      } catch (error) {
        console.error('Error removing formatting in range:', error);
        return; // If this fails, don't try to add new boxes
      }
      
      // Add suggestion boxes for matches that are fully within the specified range
      let addedCount = 0;
      this.parent.matches.forEach(match => {
        if (match && typeof match.offset === 'number' && typeof match.length === 'number' &&
            match.offset >= startOffset && (match.offset + match.length) <= safeEndOffset) {
          try {
            this.addSuggestionBoxForMatch(match);
            addedCount++;
          } catch (error) {
            console.error('Error adding suggestion box for match:', error, match);
          }
        }
      });
      
      console.log(`Updated suggestion boxes in range [${startOffset}, ${safeEndOffset}], added ${addedCount} boxes`);
    } catch (error) {
      console.error('Error in updateSuggestionBoxesForRange:', error);
    }
  }

  public addSuggestionBoxForMatch(match: any): void {
    if (!match || match.offset === undefined || match.length === undefined) {
      console.warn('Cannot add suggestion box for invalid match:', match);
      return;
    }
    
    try {
      // Get the current editor text
      const text = this.parent.quill.getText();
      
      // Validate match bounds are within text range
      if (match.offset < 0 || match.offset + match.length > text.length) {
        console.warn('Match offset out of bounds:', match);
        return;
      }
      
      // Get the exact text at the match position
      const matchText = text.slice(match.offset, match.offset + match.length);
      
      // If the matched text has changed or is empty, don't apply formatting
      if (!matchText.trim()) {
        console.warn('Match text is empty or whitespace only:', match);
        return;
      }

      // IMPORTANT: Verify the text doesn't contain spaces or unwanted word boundaries
      // This prevents highlights from spanning across multiple words
      if (/\s/.test(matchText)) {
        // Text contains spaces - find the first word only
        const firstWordMatch = matchText.match(/^[^\s]+/);
        if (firstWordMatch) {
          // Adjust the match to only cover the first word
          const adjustedMatch = {
            ...match,
            length: firstWordMatch[0].length
          };
          // Apply formatting to just the first word
          this.parent.quill.formatText(match.offset, adjustedMatch.length, 'ltmatch', adjustedMatch, 'silent');
          console.log('Added suggestion box for partial match (first word only):', adjustedMatch);
        }
      } else {
        // Text is a single word - check if it ends at a word boundary
        const isWordBoundaryAfter = 
          match.offset + match.length >= text.length || 
          /[\s.,!?;:)\]}]/.test(text[match.offset + match.length]);
        
        // Only apply formatting if at word boundary
        if (isWordBoundaryAfter) {
          // Apply formatting to the match range
          this.parent.quill.formatText(match.offset, match.length, 'ltmatch', match, 'silent');
          console.log('Added suggestion box for match at offset', match.offset);
        } else {
          // Find the next word boundary
          let boundaryPos = match.offset;
          for (let i = match.offset; i < Math.min(text.length, match.offset + match.length + 20); i++) {
            if (/[\s.,!?;:)\]}]/.test(text[i])) {
              boundaryPos = i;
              break;
            }
          }
          
          // If we found a word boundary, adjust the match length
          if (boundaryPos > match.offset) {
            const adjustedLength = boundaryPos - match.offset;
            this.parent.quill.formatText(match.offset, adjustedLength, 'ltmatch', {
              ...match,
              length: adjustedLength
            }, 'silent');
            console.log('Added suggestion box with adjusted length:', adjustedLength);
          } else {
            console.warn('Skipping non-word-boundary match:', matchText);
          }
        }
      }
    } catch (error) {
      console.error('Error adding suggestion box:', error);
    }
  }

  /**
   * Remove suggestion boxes format in a specific range.
   * @param startOffset The start offset of the range
   * @param endOffset The end offset of the range
   */
  public removeSuggestionBoxesInRange(startOffset: number, endOffset: number) {
    try {
      // Validate parameters
      if (startOffset === undefined || endOffset === undefined || 
          startOffset < 0 || endOffset < startOffset) {
        console.warn('Invalid range in removeSuggestionBoxesInRange:', {startOffset, endOffset});
        return;
      }
      
      // Validate range is within document bounds
      const textLength = this.parent.quill.getText().length;
      if (startOffset > textLength) {
        console.warn('Range start out of bounds:', startOffset, 'text length:', textLength);
        return;
      }
      
      // Adjust endOffset if needed to prevent going beyond text bounds
      const safeEndOffset = Math.min(endOffset, textLength);
      const range = safeEndOffset - startOffset;
      
      // Only proceed if range is positive
      if (range <= 0) {
        console.warn('Empty or invalid range in removeSuggestionBoxesInRange');
        return;
      }
      
      this.parent.preventLoop();
      this.parent.quill.formatText(startOffset, range, 'ltmatch', false, 'silent');
    } catch (error) {
      console.error('Error in removeSuggestionBoxesInRange:', error);
    }
  }
}
