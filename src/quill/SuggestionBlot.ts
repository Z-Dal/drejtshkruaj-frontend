import { MatchesEntity } from "../types";

/**
 * Quill editor blot that represents a suggestion.
 *
 * This is added to the text to enable the suggestion to be selected and inserted.
 *
 * @param Quill Quill static instance
 * @returns Blot class that can be registered on the Quill instance
 */
export default function createSuggestionBlotForQuillInstance(Quill: any) {
  const Inline = Quill.import("blots/inline");

  class SuggestionBlot extends Inline {
    static blotName = "ltmatch";
    static tagName = "quill-lt-match";

    static create(match: MatchesEntity) {
      const node = super.create();
      // Defensive: Only set attributes if match and required fields are valid
      if (
        match &&
        typeof match.offset === 'number' &&
        typeof match.length === 'number'
      ) {
        node.setAttribute("data-offset", match.offset.toString());
        node.setAttribute("data-length", match.length.toString());
        node.setAttribute("data-wordform", match.wordform || "");
        // Add error type class based on shortMessage
        const shortMsg = (match.shortMessage || "").toLowerCase();
        if (shortMsg.includes('drejtshkrimore')) {
          node.classList.add('spelling-error');
        } else if (shortMsg.includes('gramatikore')) {
          node.classList.add('grammar-error');
        } else if (shortMsg.includes('pikë')) {
          node.classList.add('punctuation-error');
        }
      } else {
        // Optionally, add a warning or fallback
        console.warn('SuggestionBlot.create called with invalid match:', match);
      }
      return node;
    }

    optimize() {}
  }

  return SuggestionBlot;
}
