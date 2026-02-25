import fs from 'fs';
import pdfParse from '@cedrugs/pdf-parse';

async function run() {
    try {
        console.log('Loading pdf...');
        const buffer = fs.readFileSync('test.pdf');
        console.log('Parsing pdf...');
        const data = await pdfParse(buffer);
        console.log('Success, text length:', data.text.length);
    } catch (e: any) {
        console.error('Pdf parse error:', e.message);
        console.error(e.stack);
    }
}

run();
