import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import pdf from 'pdf-parse';
import { broadcast } from './sse.js';

// ─── Types ───────────────────────────────────────────────────

export interface DocumentInfo {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    uploadedAt: Date;
}

export interface ChunkMatch {
    content: string;
    score: number;
    chunkIndex: number;
    metadata: { page?: number; section?: string; filename: string };
}

// ─── Text Extraction ─────────────────────────────────────────

/**
 * Extract raw text from a file buffer based on its MIME type.
 */
export async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    switch (mimeType) {
        case 'application/pdf': {
            const data = await pdf(buffer);
            return data.text;
        }
        case 'text/plain':
        case 'text/markdown':
        case 'text/csv':
        case 'application/json': {
            return buffer.toString('utf-8');
        }
        default: {
            // Attempt to read as text for unknown types
            console.warn(`Unknown MIME type "${mimeType}" for ${filename}, attempting text extraction.`);
            return buffer.toString('utf-8');
        }
    }
}

// ─── Chunking ────────────────────────────────────────────────

/**
 * Split text into overlapping chunks of ~chunkSize characters.
 * Uses paragraph boundaries when possible for cleaner splits.
 */
export function chunkText(text: string, chunkSize: number = 1500, overlap: number = 200): string[] {
    const chunks: string[] = [];
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    if (cleanText.length <= chunkSize) {
        return [cleanText];
    }

    let start = 0;
    while (start < cleanText.length) {
        let end = Math.min(start + chunkSize, cleanText.length);

        // Try to break at a paragraph boundary
        if (end < cleanText.length) {
            const paragraphBreak = cleanText.lastIndexOf('\n\n', end);
            if (paragraphBreak > start + chunkSize * 0.5) {
                end = paragraphBreak + 2;
            } else {
                // Fall back to sentence boundary
                const sentenceBreak = cleanText.lastIndexOf('. ', end);
                if (sentenceBreak > start + chunkSize * 0.5) {
                    end = sentenceBreak + 2;
                }
            }
        }

        chunks.push(cleanText.slice(start, end).trim());
        start = end - overlap;
        if (start >= cleanText.length) break;
    }

    return chunks.filter(c => c.length > 0);
}

// ─── Document Processing ─────────────────────────────────────

/**
 * Process an uploaded file: save metadata, extract text, chunk, and store.
 */
export async function processDocument(
    missionId: string,
    file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
): Promise<DocumentInfo> {
    // 1. Save document metadata
    const [doc] = await db.insert(schema.missionDocuments).values({
        missionId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: 'processing',
    }).returning();

    try {
        // 2. Extract text
        const text = await extractText(file.buffer, file.mimetype, file.originalname);

        if (!text.trim()) {
            await db.update(schema.missionDocuments)
                .set({ status: 'empty' })
                .where(eq(schema.missionDocuments.id, doc.id));

            broadcast(missionId, 'document-uploaded', {
                id: doc.id, filename: doc.filename, sizeBytes: doc.sizeBytes, status: 'empty',
            });
            return { ...doc, status: 'empty' };
        }

        // 3. Chunk the text
        const chunks = chunkText(text);

        // 4. Store chunks
        for (let i = 0; i < chunks.length; i++) {
            await db.insert(schema.documentChunks).values({
                documentId: doc.id,
                missionId,
                chunkIndex: i,
                content: chunks[i],
                metadata: {
                    filename: file.originalname,
                    page: undefined,
                    section: undefined,
                },
            });
        }

        // 5. Mark as ready
        await db.update(schema.missionDocuments)
            .set({ status: 'ready' })
            .where(eq(schema.missionDocuments.id, doc.id));

        broadcast(missionId, 'document-uploaded', {
            id: doc.id,
            filename: doc.filename,
            sizeBytes: doc.sizeBytes,
            status: 'ready',
            chunkCount: chunks.length,
        });

        console.log(`📄 Processed "${file.originalname}": ${chunks.length} chunks extracted.`);
        return { ...doc, status: 'ready' };

    } catch (error: any) {
        console.error(`Failed to process "${file.originalname}":`, error);
        await db.update(schema.missionDocuments)
            .set({ status: 'failed' })
            .where(eq(schema.missionDocuments.id, doc.id));

        broadcast(missionId, 'document-uploaded', {
            id: doc.id, filename: doc.filename, sizeBytes: doc.sizeBytes, status: 'failed',
        });
        return { ...doc, status: 'failed' };
    }
}

// ─── Document Search ─────────────────────────────────────────

/**
 * Search uploaded document chunks by keyword scoring.
 * Returns top matches with context.
 */
export async function searchDocuments(missionId: string, query: string, maxResults: number = 5): Promise<ChunkMatch[]> {
    // Fetch all chunks for this mission
    const allChunks = await db.query.documentChunks.findMany({
        where: eq(schema.documentChunks.missionId, missionId),
    });

    if (allChunks.length === 0) {
        return [];
    }

    // Tokenize query into searchable terms
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    // Score each chunk
    const scored = allChunks.map(chunk => {
        const contentLower = chunk.content.toLowerCase();
        let score = 0;

        for (const term of queryTerms) {
            // Count occurrences of each term
            const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const matches = contentLower.match(regex);
            if (matches) {
                score += matches.length;
            }
        }

        // Boost for exact phrase match
        if (contentLower.includes(query.toLowerCase())) {
            score += 5;
        }

        return {
            content: chunk.content,
            score,
            chunkIndex: chunk.chunkIndex,
            metadata: chunk.metadata as { page?: number; section?: string; filename: string },
        };
    });

    // Return top matches (only those with score > 0)
    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
}

// ─── Query Helpers ───────────────────────────────────────────

/**
 * Get all documents for a mission (for the sidebar panel).
 */
export async function getDocumentsForMission(missionId: string): Promise<DocumentInfo[]> {
    const docs = await db.query.missionDocuments.findMany({
        where: eq(schema.missionDocuments.missionId, missionId),
    });
    return docs.map(d => ({
        id: d.id,
        filename: d.filename,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        status: d.status,
        uploadedAt: d.uploadedAt,
    }));
}

/**
 * Check if a mission has any uploaded documents.
 */
export async function missionHasDocuments(missionId: string): Promise<boolean> {
    const docs = await db.query.missionDocuments.findMany({
        where: eq(schema.missionDocuments.missionId, missionId),
        limit: 1,
    });
    return docs.length > 0;
}
