/**
 * Embedding generation using OpenAI, Voyage, or Ollama
 */

import OpenAI from 'openai';
import { Chunk } from './chunker.js';

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export interface EmbeddingResult {
  chunkId: string;
  embedding: number[];
}

/**
 * Generate embeddings for chunks using OpenAI
 */
export async function generateEmbeddings(
  chunks: Chunk[],
  apiKey: string,
  model: string = 'text-embedding-3-small'
): Promise<EmbeddingResult[]> {
  const client = new OpenAI({ apiKey });
  const results: EmbeddingResult[] = [];
  
  // Process in batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(chunk => {
      // Include context if available (from contextual retrieval)
      const content = chunk.context 
        ? `${chunk.context}\n\n${chunk.content}`
        : chunk.content;
      
      // Truncate if too long (OpenAI limit is 8191 tokens)
      return content.substring(0, 30000);
    });
    
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        const response = await client.embeddings.create({
          model,
          input: texts,
        });
        
        for (let j = 0; j < response.data.length; j++) {
          results.push({
            chunkId: batch[j].id,
            embedding: response.data[j].embedding,
          });
        }
        
        break;
      } catch (error) {
        retries++;
        if (retries >= MAX_RETRIES) {
          throw error;
        }
        
        // Check for rate limit
        if (error instanceof Error && error.message.includes('429')) {
          await sleep(RETRY_DELAY * retries * 2);
        } else {
          await sleep(RETRY_DELAY * retries);
        }
      }
    }
    
    // Progress indicator
    if (i % (BATCH_SIZE * 10) === 0 && i > 0) {
      console.log(`  Embedded ${i}/${chunks.length} chunks...`);
    }
  }
  
  return results;
}

/**
 * Generate a single embedding for a query
 */
export async function generateQueryEmbedding(
  query: string,
  apiKey: string,
  model: string = 'text-embedding-3-small'
): Promise<number[]> {
  const client = new OpenAI({ apiKey });
  
  const response = await client.embeddings.create({
    model,
    input: query,
  });
  
  return response.data[0].embedding;
}

/**
 * Generate embeddings using Voyage AI (alternative provider)
 */
export async function generateVoyageEmbeddings(
  chunks: Chunk[],
  apiKey: string,
  model: string = 'voyage-code-2'
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];
  
  // Process in batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(chunk => {
      const content = chunk.context 
        ? `${chunk.context}\n\n${chunk.content}`
        : chunk.content;
      return content.substring(0, 30000);
    });
    
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts,
        input_type: 'document',
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Voyage API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    for (let j = 0; j < data.data.length; j++) {
      results.push({
        chunkId: batch[j].id,
        embedding: data.data[j].embedding,
      });
    }
  }
  
  return results;
}

/**
 * Generate embeddings using local Ollama
 */
export async function generateOllamaEmbeddings(
  chunks: Chunk[],
  model: string = 'nomic-embed-text',
  baseUrl: string = 'http://localhost:11434'
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];
  
  // Ollama doesn't support batching, process one at a time
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const content = chunk.context 
      ? `${chunk.context}\n\n${chunk.content}`
      : chunk.content;
    
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: content.substring(0, 30000),
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    results.push({
      chunkId: chunk.id,
      embedding: data.embedding,
    });
    
    // Progress indicator
    if (i % 100 === 0 && i > 0) {
      console.log(`  Embedded ${i}/${chunks.length} chunks...`);
    }
  }
  
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
