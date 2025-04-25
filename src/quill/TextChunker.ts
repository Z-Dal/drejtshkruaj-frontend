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
    const paragraphs = text.split('\n');
    let indexCounter = 0;
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      if (paragraph.trim().length > 0) {
        chunks.push({
          index: indexCounter,
          text: paragraph,
          startOffset: currentOffset,
          endOffset: currentOffset + paragraph.length
        });
        indexCounter++;
      }
      currentOffset += paragraph.length + 1; // +1 for newline
    }

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