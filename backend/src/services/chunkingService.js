const MIN_CHUNK_TOKENS = 200;
const MAX_CHUNK_TOKENS = 380;
const CHUNK_OVERLAP = 50;
const TOKEN_PATTERN = /[^\s]+/g;

const tokenize = (text) => text.match(TOKEN_PATTERN) || [];

export const chunkDocuments = (documents) => {
  return documents.flatMap((document) => {
    if (!document.abstract) {
      return [];
    }

    const words = tokenize(document.abstract);
    if (words.length === 0) {
      return [];
    }

    const chunks = [];
    let start = 0;
    let chunkIndex = 0;

    while (start < words.length) {
      let end = Math.min(start + MAX_CHUNK_TOKENS, words.length);
      const remainingTokens = words.length - end;

      if (remainingTokens > 0 && remainingTokens < MIN_CHUNK_TOKENS) {
        end = words.length;
      }

      const text = words.slice(start, end).join(" ");
      chunks.push({
        chunkId: `${document.id}-chunk-${chunkIndex + 1}`,
        documentId: document.id,
        source: document.source,
        title: document.title,
        year: document.year,
        position: chunkIndex,
        tokenCount: end - start,
        text
      });

      if (end >= words.length) {
        break;
      }

      start = Math.max(end - CHUNK_OVERLAP, start + 1);
      chunkIndex += 1;
    }

    return chunks;
  });
};
