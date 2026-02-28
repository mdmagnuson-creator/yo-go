/**
 * Vector storage using LanceDB
 */

import * as lancedb from '@lancedb/lancedb';
import { Chunk } from './chunker.js';
import { EmbeddingResult } from './embeddings.js';
import path from 'path';
import fs from 'fs';

export interface StoredChunk {
  id: string;
  content: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  language: string;
  type: string;
  context?: string;
  vector: number[];
}

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private indexDir: string;
  
  constructor(indexDir: string) {
    this.indexDir = indexDir;
  }
  
  /**
   * Initialize the vector store
   */
  async initialize(): Promise<void> {
    this.db = await lancedb.connect(this.indexDir);
  }
  
  /**
   * Add codebase embeddings to the store
   */
  async addCodebaseEmbeddings(
    chunks: Chunk[],
    embeddings: EmbeddingResult[]
  ): Promise<void> {
    if (!this.db) throw new Error('Store not initialized');
    
    // Create embedding lookup
    const embeddingMap = new Map<string, number[]>();
    for (const e of embeddings) {
      embeddingMap.set(e.chunkId, e.embedding);
    }
    
    // Prepare data
    const data: StoredChunk[] = chunks
      .filter(chunk => embeddingMap.has(chunk.id))
      .map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        filePath: chunk.filePath,
        lineStart: chunk.lineRange[0],
        lineEnd: chunk.lineRange[1],
        language: chunk.language,
        type: chunk.type,
        context: chunk.context,
        vector: embeddingMap.get(chunk.id)!,
      }));
    
    if (data.length === 0) return;
    
    // Create or overwrite table
    try {
      await this.db.dropTable('codebase');
    } catch {
      // Table doesn't exist, that's fine
    }
    
    await this.db.createTable('codebase', data);
  }
  
  /**
   * Add database embeddings to the store
   */
  async addDatabaseEmbeddings(
    chunks: Chunk[],
    embeddings: EmbeddingResult[]
  ): Promise<void> {
    if (!this.db) throw new Error('Store not initialized');
    
    const embeddingMap = new Map<string, number[]>();
    for (const e of embeddings) {
      embeddingMap.set(e.chunkId, e.embedding);
    }
    
    const data: StoredChunk[] = chunks
      .filter(chunk => embeddingMap.has(chunk.id))
      .map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        filePath: chunk.filePath,
        lineStart: chunk.lineRange[0],
        lineEnd: chunk.lineRange[1],
        language: chunk.language,
        type: chunk.type,
        context: chunk.context,
        vector: embeddingMap.get(chunk.id)!,
      }));
    
    if (data.length === 0) return;
    
    try {
      await this.db.dropTable('database');
    } catch {
      // Table doesn't exist
    }
    
    await this.db.createTable('database', data);
  }
  
  /**
   * Search for similar vectors
   */
  async search(
    queryVector: number[],
    options: {
      topK?: number;
      table?: 'codebase' | 'database' | 'all';
      filters?: {
        type?: string;
        language?: string;
        filePatterns?: string[];
      };
    } = {}
  ): Promise<StoredChunk[]> {
    if (!this.db) throw new Error('Store not initialized');
    
    const topK = options.topK || 20;
    const tables = options.table === 'all' 
      ? ['codebase', 'database'] 
      : [options.table || 'codebase'];
    
    const results: StoredChunk[] = [];
    
    for (const tableName of tables) {
      try {
        const table = await this.db.openTable(tableName);
        
        let query = table.search(queryVector).limit(topK);
        
        // Apply filters
        if (options.filters?.type) {
          query = query.where(`type = '${options.filters.type}'`);
        }
        if (options.filters?.language) {
          query = query.where(`language = '${options.filters.language}'`);
        }
        
        const tableResults = await query.toArray();
        results.push(...tableResults.map(r => ({
          id: r.id,
          content: r.content,
          filePath: r.filePath,
          lineStart: r.lineStart,
          lineEnd: r.lineEnd,
          language: r.language,
          type: r.type,
          context: r.context,
          vector: r.vector,
          _distance: r._distance, // LanceDB adds this
        })));
      } catch {
        // Table doesn't exist, skip
      }
    }
    
    // Sort by distance and return top K
    return results
      .sort((a, b) => (a as any)._distance - (b as any)._distance)
      .slice(0, topK);
  }
  
  /**
   * Remove chunks by file paths
   */
  async removeByFiles(filePaths: string[]): Promise<void> {
    if (!this.db) throw new Error('Store not initialized');
    
    try {
      const table = await this.db.openTable('codebase');
      
      for (const filePath of filePaths) {
        await table.delete(`filePath = '${filePath.replace(/'/g, "''")}'`);
      }
    } catch {
      // Table doesn't exist
    }
  }
  
  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    if (!this.db) throw new Error('Store not initialized');
    
    try {
      await this.db.dropTable('codebase');
    } catch {
      // Table doesn't exist
    }
    
    try {
      await this.db.dropTable('database');
    } catch {
      // Table doesn't exist
    }
  }
  
  /**
   * Get all chunks (for BM25 rebuild)
   */
  async getAllChunks(): Promise<Chunk[]> {
    if (!this.db) throw new Error('Store not initialized');
    
    const chunks: Chunk[] = [];
    
    try {
      const table = await this.db.openTable('codebase');
      const results = await table.query().toArray();
      
      for (const r of results) {
        chunks.push({
          id: r.id,
          content: r.content,
          filePath: r.filePath,
          lineRange: [r.lineStart, r.lineEnd],
          language: r.language,
          type: r.type as Chunk['type'],
          context: r.context,
        });
      }
    } catch {
      // Table doesn't exist
    }
    
    return chunks;
  }
}
