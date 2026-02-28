/**
 * Hybrid search combining vector similarity and BM25 keyword search
 */

import { VectorStore, StoredChunk } from './store.js';
import { searchBM25 } from './bm25.js';
import { generateEmbeddings } from './embeddings.js';

export interface SearchResult {
  id: string;
  content: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  language: string;
  type: string;
  context?: string;
  score: number;
  vectorScore?: number;
  bm25Score?: number;
}

export interface HybridSearchOptions {
  topK?: number;
  hybridWeight?: number; // Weight for vector search (0-1), BM25 gets (1-weight)
  contentType?: 'code' | 'schema' | 'config' | 'docs';
  language?: string;
  filePatterns?: string[];
}

/**
 * Perform hybrid search combining vector similarity and BM25
 */
export async function hybridSearch(
  indexDir: string,
  query: string,
  openaiKey: string,
  options: HybridSearchOptions = {}
): Promise<SearchResult[]> {
  const topK = options.topK || 20;
  const hybridWeight = options.hybridWeight ?? 0.7;
  
  // Fetch more candidates than needed for reranking
  const fetchK = Math.min(topK * 3, 100);
  
  // Generate query embedding
  const queryEmbeddings = await generateEmbeddings(
    [{ id: 'query', content: query, filePath: '', lineRange: [0, 0], language: '', type: 'query' }],
    openaiKey
  );
  
  if (queryEmbeddings.length === 0) {
    throw new Error('Failed to generate query embedding');
  }
  
  const queryVector = queryEmbeddings[0].embedding;
  
  // Vector search
  const store = new VectorStore(indexDir);
  await store.initialize();
  
  const vectorResults = await store.search(queryVector, {
    topK: fetchK,
    table: options.contentType === 'schema' || options.contentType === 'config' ? 'database' : 
           options.contentType === 'code' ? 'codebase' : 'all',
    filters: {
      type: options.contentType,
      language: options.language,
      filePatterns: options.filePatterns,
    },
  });
  
  // BM25 search
  const bm25Results = await searchBM25(indexDir, query, fetchK);
  
  // Create lookup maps
  const vectorScores = new Map<string, { chunk: StoredChunk; score: number }>();
  for (let i = 0; i < vectorResults.length; i++) {
    const chunk = vectorResults[i];
    // Convert distance to similarity score (lower distance = higher similarity)
    // LanceDB returns L2 distance, so we use 1 / (1 + distance) for similarity
    const distance = (chunk as any)._distance || 0;
    const similarity = 1 / (1 + distance);
    vectorScores.set(chunk.id, { chunk, score: similarity });
  }
  
  const bm25Scores = new Map<string, number>();
  for (const result of bm25Results) {
    bm25Scores.set(result.chunkId, result.score);
  }
  
  // Normalize BM25 scores to 0-1 range
  const maxBm25 = Math.max(...bm25Results.map(r => r.score), 1);
  for (const [id, score] of bm25Scores) {
    bm25Scores.set(id, score / maxBm25);
  }
  
  // Combine results using Reciprocal Rank Fusion or weighted average
  const allIds = new Set([...vectorScores.keys(), ...bm25Scores.keys()]);
  const combinedResults: SearchResult[] = [];
  
  for (const id of allIds) {
    const vectorData = vectorScores.get(id);
    const vectorScore = vectorData?.score || 0;
    const bm25Score = bm25Scores.get(id) || 0;
    
    // Weighted combination
    const combinedScore = hybridWeight * vectorScore + (1 - hybridWeight) * bm25Score;
    
    // Get chunk data (prefer vector result as it has full data)
    let chunk: StoredChunk | undefined = vectorData?.chunk;
    
    if (!chunk) {
      // Need to fetch from store
      const results = await store.search(queryVector, { topK: 1 });
      chunk = results.find(c => c.id === id);
    }
    
    if (chunk) {
      combinedResults.push({
        id: chunk.id,
        content: chunk.content,
        filePath: chunk.filePath,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        language: chunk.language,
        type: chunk.type,
        context: chunk.context,
        score: combinedScore,
        vectorScore,
        bm25Score,
      });
    }
  }
  
  // Sort by combined score and return top K
  return combinedResults
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Perform vector-only search
 */
export async function vectorSearch(
  indexDir: string,
  query: string,
  openaiKey: string,
  options: { topK?: number; table?: 'codebase' | 'database' | 'all' } = {}
): Promise<SearchResult[]> {
  const topK = options.topK || 20;
  
  const queryEmbeddings = await generateEmbeddings(
    [{ id: 'query', content: query, filePath: '', lineRange: [0, 0], language: '', type: 'query' }],
    openaiKey
  );
  
  if (queryEmbeddings.length === 0) {
    throw new Error('Failed to generate query embedding');
  }
  
  const queryVector = queryEmbeddings[0].embedding;
  
  const store = new VectorStore(indexDir);
  await store.initialize();
  
  const results = await store.search(queryVector, {
    topK,
    table: options.table,
  });
  
  return results.map(chunk => ({
    id: chunk.id,
    content: chunk.content,
    filePath: chunk.filePath,
    lineStart: chunk.lineStart,
    lineEnd: chunk.lineEnd,
    language: chunk.language,
    type: chunk.type,
    context: chunk.context,
    score: 1 / (1 + ((chunk as any)._distance || 0)),
  }));
}

/**
 * Perform BM25-only search (for debugging/comparison)
 */
export async function keywordSearch(
  indexDir: string,
  query: string,
  options: { topK?: number } = {}
): Promise<{ id: string; score: number }[]> {
  const topK = options.topK || 20;
  return searchBM25(indexDir, query, topK);
}
