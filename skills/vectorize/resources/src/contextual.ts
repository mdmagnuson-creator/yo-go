/**
 * Contextual Retrieval preprocessing using Claude Haiku
 */

import Anthropic from '@anthropic-ai/sdk';
import { Chunk } from './chunker.js';
import fs from 'fs';

const BATCH_SIZE = 10; // Process 10 chunks at a time for prompt caching
const MAX_RETRIES = 3;

/**
 * Add contextual descriptions to chunks using Claude Haiku
 */
export async function addContextualDescriptions(
  chunks: Chunk[],
  apiKey: string
): Promise<Chunk[]> {
  const client = new Anthropic({ apiKey });
  const enrichedChunks: Chunk[] = [];
  
  // Group chunks by file for prompt caching
  const chunksByFile = new Map<string, Chunk[]>();
  for (const chunk of chunks) {
    const existing = chunksByFile.get(chunk.filePath) || [];
    existing.push(chunk);
    chunksByFile.set(chunk.filePath, existing);
  }
  
  let processed = 0;
  
  for (const [filePath, fileChunks] of chunksByFile) {
    // Read full file content for context (cached)
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    } catch {
      // File might not exist at absolute path, skip context
      enrichedChunks.push(...fileChunks);
      continue;
    }
    
    // Truncate file content if too large
    const maxFileContent = 50000; // ~12k tokens
    const truncatedFile = fileContent.length > maxFileContent
      ? fileContent.substring(0, maxFileContent) + '\n...[truncated]'
      : fileContent;
    
    // Process chunks in batches
    for (let i = 0; i < fileChunks.length; i += BATCH_SIZE) {
      const batch = fileChunks.slice(i, i + BATCH_SIZE);
      
      for (const chunk of batch) {
        let retries = 0;
        
        while (retries < MAX_RETRIES) {
          try {
            const context = await generateContext(client, truncatedFile, chunk);
            enrichedChunks.push({
              ...chunk,
              context,
            });
            break;
          } catch (error) {
            retries++;
            if (retries >= MAX_RETRIES) {
              // Skip context on failure, keep original chunk
              enrichedChunks.push(chunk);
              console.warn(`Failed to generate context for ${chunk.id}:`, error);
            } else {
              await sleep(1000 * retries);
            }
          }
        }
        
        processed++;
      }
      
      // Progress indicator
      if (processed % 100 === 0) {
        console.log(`  Added context to ${processed}/${chunks.length} chunks...`);
      }
    }
  }
  
  return enrichedChunks;
}

/**
 * Generate contextual description for a single chunk
 */
async function generateContext(
  client: Anthropic,
  fileContent: string,
  chunk: Chunk
): Promise<string> {
  const prompt = `<document>
${fileContent}
</document>

Here is the chunk we want to situate within the whole document:

<chunk>
${chunk.content}
</chunk>

Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.`;

  const response = await client.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });
  
  // Extract text from response
  const textBlock = response.content.find(block => block.type === 'text');
  return textBlock?.text || '';
}

/**
 * Check if contextual retrieval should be enabled
 */
export function shouldEnableContextual(
  setting: 'auto' | 'always' | 'never',
  totalTokens: number
): boolean {
  switch (setting) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'auto':
      // Enable for codebases > 50k tokens
      return totalTokens > 50000;
    default:
      return false;
  }
}

/**
 * Estimate total tokens in chunks
 */
export function estimateTotalTokens(chunks: Chunk[]): number {
  return chunks.reduce((total, chunk) => {
    return total + Math.ceil(chunk.content.length / 4);
  }, 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
