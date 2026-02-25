import { parentPort, workerData } from 'worker_threads';

async function processPdf() {
    if (!parentPort) return;
    try {
        // dynamic imports to avoid breaking other components if dependencies fail
        const { PDFDocument } = await import('pdf-lib');
        const { default: pdfParse } = await import('@cedrugs/pdf-parse');

        // Reconstruct the node Buffer from the array buffer passed over the IPC channel
        const rawBuffer = Buffer.from(workerData.buffer);

        // --- LAYER 1: Sanitize & Flatten ---
        // Load the document using pdf-lib, ignoring encryption if possible to prevent basic errors
        const pdfDoc = await PDFDocument.load(rawBuffer, { ignoreEncryption: true });

        // Saving the document effectively reconstructs and standardizes the PDF format, discarding corrupt structures
        const sanitizedBytes = await pdfDoc.save();
        const sanitizedBuffer = Buffer.from(sanitizedBytes);

        // --- LAYER 2: Text Extraction ---
        // Pass to pdf-parse. Needs explicit formatting as a Uint8Array
        const uint8Array = new Uint8Array(
            sanitizedBuffer.buffer,
            sanitizedBuffer.byteOffset,
            sanitizedBuffer.byteLength
        );
        const parsedData = await pdfParse(uint8Array);

        parentPort.postMessage({ success: true, text: parsedData.text });
    } catch (error: any) {
        // Post message failure state, the main server thread catches this smoothly instead of dying.
        parentPort.postMessage({ success: false, error: error.message || String(error) });
    }
}

if (parentPort) {
    processPdf();
}
