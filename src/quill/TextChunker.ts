import { MatchesEntity } from "../types";

export interface TextChunk {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export class TextChunker {
  static getChunks(text: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    let currentOffset = 0;
    
    // Split text by newlines to get paragraphs
    // Use a regex that handles both \n and \r\n
    const paragraphs = text.split(/\r?\n/);
    let indexCounter = 0;
    
    console.log(`TextChunker found ${paragraphs.length} paragraphs`);
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      
      // Only process non-empty paragraphs
      if (paragraph.trim().length > 0) {
        // Create a chunk for this paragraph
        const chunk = {
          index: indexCounter,
          text: paragraph,
          startOffset: currentOffset,
          endOffset: currentOffset + paragraph.length
        };
        
        chunks.push(chunk);
        console.log(`Added paragraph ${indexCounter}: ${paragraph.substring(0, 30)}...`);
        indexCounter++;
      } else {
        console.log(`Skipping empty paragraph at index ${i}`);
      }
      
      // Account for the newline character in currentOffset
      // Use +1 for \n, or the actual length of the newline in the text
      currentOffset += paragraph.length + 1;
    }

    console.log(`TextChunker returning ${chunks.length} chunks for processing`);
    return chunks;
  }

  static adjustOffsetForChunk(
    matches: MatchesEntity[], 
    chunkStartOffset: number, 
    chunkEndOffset: number
  ): MatchesEntity[] {
    return matches
      .filter(match => {
        const relativeOffset = match.offset;
        return relativeOffset >= 0 && 
               relativeOffset + match.length <= (chunkEndOffset - chunkStartOffset);
      })
      .map(match => ({
        ...match,
        offset: match.offset + chunkStartOffset
      }));
  }
} 