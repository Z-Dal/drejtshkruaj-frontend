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
    const text = quill.getText();

    // Handle each match separately to be more precise
    matchesToRemove.forEach(match => {
      try {
        // Verify the match still exists at the expected position
        if (match.offset < 0 || match.offset + match.length > text.length) {
          console.warn("Match offset out of bounds, skipping removal:", match);
          return;
        }

        // Extra check: See if the match text has changed, if so we might not want to remove
        const matchText = text.slice(match.offset, match.offset + match.length);
        if (match.wordform && match.wordform !== matchText.trim()) {
          console.log(`Text at match position has changed from "${match.wordform}" to "${matchText.trim()}", skipping removal`);
          return;
        }

        // Apply the formatting removal just to this match
        quill.formatText(match.offset, match.length, 'ltmatch', false, 'silent');
      } catch (error) {
        console.error('Error removing match formatting:', error, match);
      }
    });
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
      
      this.parent.preventLoop();
      
      const text = this.parent.quill.getText();
      
      // Find matches that need to be applied/reapplied in this range
      const matchesInRange = this.parent.matches.filter(match => 
        match && 
        typeof match.offset === 'number' && 
        typeof match.length === 'number' &&
        match.offset >= startOffset && 
        (match.offset + match.length) <= safeEndOffset
      );
      
      // If no matches in this range, we don't need to do anything
      if (matchesInRange.length === 0) {
        return;
      }
      
      // Get existing formatting in this range
      const existingFormatting = [];
      const contents = this.parent.quill.getContents(startOffset, range);
      
      if (contents && contents.ops) {
        for (let i = 0; i < contents.ops.length; i++) {
          const op = contents.ops[i];
          if (op.attributes && op.attributes.ltmatch) {
            existingFormatting.push(op.attributes.ltmatch);
          }
        }
      }
      
      // Only perform formatting if we have matches to apply or existing formatting to update
      if (matchesInRange.length > 0 || existingFormatting.length > 0) {
        // Remove any existing formatting only if we'll apply new formatting
        // We're being careful not to remove formatting unnecessarily
        this.parent.quill.formatText(startOffset, range, 'ltmatch', false, 'silent');
        
        // Apply formatting for each match individually
        matchesInRange.forEach(match => {
          try {
            // Verify the text at the match position
            const matchText = text.slice(match.offset, match.offset + match.length);
            
            // Only apply if the text matches or if there's no wordform to check against
            if (matchText.trim() && (!match.wordform || matchText.trim() === match.wordform)) {
              this.parent.quill.formatText(match.offset, match.length, 'ltmatch', match, 'silent');
            } else if (match.wordform) {
              // Try to find the exact word nearby if it has moved slightly
              const searchStart = Math.max(0, match.offset - 20);
              const searchEnd = Math.min(text.length, match.offset + match.length + 20);
              const textToSearch = text.slice(searchStart, searchEnd);
              
              // Look for the exact wordform nearby
              const wordIndex = textToSearch.indexOf(match.wordform);
              if (wordIndex !== -1) {
                const actualOffset = searchStart + wordIndex;
                this.parent.quill.formatText(
                  actualOffset, 
                  match.wordform.length, 
                  'ltmatch', 
                  {...match, offset: actualOffset}, 
                  'silent'
                );
                
                // Update the match position in the parent's matches array
                const matchIndex = this.parent.matches.findIndex(m => 
                  m.offset === match.offset && m.length === match.length
                );
                if (matchIndex !== -1) {
                  this.parent.matches[matchIndex].offset = actualOffset;
                  this.parent.matches[matchIndex].length = match.wordform.length;
                }
              }
            }
          } catch (error) {
            console.error('Error applying match formatting:', error, match);
          }
        });
      }
      
      console.log(`Updated suggestion boxes in range [${startOffset}, ${safeEndOffset}], processed ${matchesInRange.length} matches`);
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

      // Check if format already exists at this position
      let existingFormat: any = false;
      try {
        const formats = this.parent.quill.getFormat(match.offset, match.length);
        existingFormat = formats && formats.ltmatch;
      } catch (e) {
        // Error getting format, continue without checking
      }

      // If format already exists and matches this match, don't reapply
      if (existingFormat && 
          existingFormat.offset === match.offset && 
          existingFormat.length === match.length) {
        return;
      }
      
      // Get the exact text at the match position
      const matchText = text.slice(match.offset, match.offset + match.length);
      
      // If the matched text has changed or is empty, try to find the actual word
      if (!matchText.trim()) {
        console.warn('Match text is empty or whitespace only:', match);
        return;
      }

      // First try to apply the match directly if possible
      if (!match.wordform || matchText.trim() === match.wordform) {
        // Apply using Delta instead of formatText to be more precise
        try {
          const delta = new Delta()
            .retain(match.offset)
            .retain(match.length, { ltmatch: match });
          
          this.parent.quill.updateContents(delta, 'silent');
          return;
        } catch (err) {
          console.error('Error applying match formatting with Delta:', err);
          // Fall back to formatText if Delta fails
          this.parent.quill.formatText(match.offset, match.length, 'ltmatch', match, 'silent');
          return;
        }
      }
      
      // If we get here, the text at the original position doesn't match the expected wordform
      // Let's try to find it nearby
      const searchStart = Math.max(0, match.offset - 30);
      const searchEnd = Math.min(text.length, match.offset + match.length + 30);
      const textToSearch = text.slice(searchStart, searchEnd);
      
      const wordIndex = textToSearch.indexOf(match.wordform);
      if (wordIndex !== -1) {
        // Found the word nearby
        const actualOffset = searchStart + wordIndex;
        
        // Update the match and apply formatting
        const updatedMatch = {
          ...match,
          offset: actualOffset,
          length: match.wordform.length
        };
        
        // Apply formatting ONLY to this specific match without affecting others
        try {
          const delta = new Delta()
            .retain(actualOffset)
            .retain(match.wordform.length, { ltmatch: updatedMatch });
          
          this.parent.quill.updateContents(delta, 'silent');
        } catch (err) {
          console.error('Error applying updated match with Delta:', err);
          // Fall back to formatText if Delta fails
          this.parent.quill.formatText(actualOffset, match.wordform.length, 'ltmatch', updatedMatch, 'silent');
        }
        
        // Update the match in the parent's array
        const matchIndex = this.parent.matches.findIndex(m => 
          m.offset === match.offset && 
          m.length === match.length && 
          this.isSameMatch(m, match)
        );
        
        if (matchIndex !== -1) {
          this.parent.matches[matchIndex] = updatedMatch;
        }
        
        return;
      }
      
      // For more complex cases like text with spaces, handle carefully
      if (/\s/.test(matchText)) {
        // Text contains spaces - find the first word only
        const firstWordMatch = matchText.match(/^[^\s]+/);
        if (firstWordMatch) {
          // Adjust the match to only cover the first word
          const adjustedMatch = {
            ...match,
            length: firstWordMatch[0].length
          };
          
          // Apply formatting to just the first word using Delta
          try {
            const delta = new Delta()
              .retain(match.offset)
              .retain(adjustedMatch.length, { ltmatch: adjustedMatch });
            
            this.parent.quill.updateContents(delta, 'silent');
          } catch (err) {
            console.error('Error applying adjusted match with Delta:', err);
            // Fall back to formatText if Delta fails
            this.parent.quill.formatText(match.offset, adjustedMatch.length, 'ltmatch', adjustedMatch, 'silent');
          }
          
          // Update the match in the parent's array
          const matchIndex = this.parent.matches.findIndex(m => 
            m.offset === match.offset && 
            m.length === match.length && 
            this.isSameMatch(m, match)
          );
          
          if (matchIndex !== -1) {
            this.parent.matches[matchIndex] = adjustedMatch;
          }
        }
      } else {
        // Apply formatting to the match even if it doesn't perfectly match,
        // as long as it's a valid word boundary
        const isWordBoundaryAfter = 
          match.offset + match.length >= text.length || 
          /[\s.,!?;:)\]}]/.test(text[match.offset + match.length]);
        
        if (isWordBoundaryAfter) {
          // Apply using Delta first, fall back to formatText
          try {
            const delta = new Delta()
              .retain(match.offset)
              .retain(match.length, { ltmatch: match });
            
            this.parent.quill.updateContents(delta, 'silent');
          } catch (err) {
            console.error('Error applying boundary match with Delta:', err);
            this.parent.quill.formatText(match.offset, match.length, 'ltmatch', match, 'silent');
          }
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
            const adjustedMatch = {
              ...match,
              length: adjustedLength
            };
            
            // Apply using Delta first, fall back to formatText
            try {
              const delta = new Delta()
                .retain(match.offset)
                .retain(adjustedLength, { ltmatch: adjustedMatch });
              
              this.parent.quill.updateContents(delta, 'silent');
            } catch (err) {
              console.error('Error applying boundary match with Delta:', err);
              this.parent.quill.formatText(match.offset, adjustedLength, 'ltmatch', adjustedMatch, 'silent');
            }
            
            // Update the match in the parent's array
            const matchIndex = this.parent.matches.findIndex(m => 
              m.offset === match.offset && 
              m.length === match.length && 
              this.isSameMatch(m, match)
            );
            
            if (matchIndex !== -1) {
              this.parent.matches[matchIndex] = adjustedMatch;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error adding suggestion box:', error);
    }
  }

  // Helper method to compare matches regardless of whether they have ID field
  private isSameMatch(match1: any, match2: any): boolean {
    // Same offset and length is a basic match
    if (match1.offset === match2.offset && match1.length === match2.length) {
      // If both have IDs, compare them
      if (match1.id !== undefined && match2.id !== undefined) {
        return match1.id === match2.id;
      }
      // If both have same message, consider them the same match
      if (match1.message && match2.message) {
        return match1.message === match2.message;
      }
      // If both have same wordform, consider them the same match
      if (match1.wordform && match2.wordform) {
        return match1.wordform === match2.wordform;
      }
      // Basic match is enough if no other identifiers
      return true;
    }
    return false;
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
      
      // IMPORTANT: Log which range we're removing
      console.log(`Removing suggestion boxes in range [${startOffset}, ${safeEndOffset}]`);
      
      this.parent.preventLoop();
      
      // Get current matches in this range
      const matchesInRange = this.parent.matches.filter(match => 
        match && 
        typeof match.offset === 'number' && 
        match.offset >= startOffset && 
        match.offset + match.length <= safeEndOffset
      );
      
      // Remove formatting only for specific matches in this range to avoid disturbing other ranges
      if (matchesInRange.length > 0) {
        this.removeMatches(matchesInRange);
      } else {
        // If no specific matches found, then use formatText as a fallback
        this.parent.quill.formatText(startOffset, range, 'ltmatch', false, 'silent');
      }
    } catch (error) {
      console.error('Error in removeSuggestionBoxesInRange:', error);
    }
  }
}
