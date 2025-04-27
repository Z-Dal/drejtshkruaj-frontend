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
    // Remove suggestion boxes formatting in the specified range
    this.parent.quill.formatText(startOffset, endOffset - startOffset, 'ltmatch', false, 'silent');
    
    // Add suggestion boxes for matches that are fully within the specified range
    this.parent.matches.forEach(match => {
      if (match.offset >= startOffset && (match.offset + match.length) <= endOffset) {
        this.addSuggestionBoxForMatch(match);
      }
    });
  }

  public addSuggestionBoxForMatch(match: any): void {
    // Apply formatting to the match range. Here, we pass the match object as the value for ltmatch formatting.
    this.parent.quill.formatText(match.offset, match.length, 'ltmatch', match, 'silent');
    console.log('Added suggestion box for match at offset', match.offset);
  }
}
