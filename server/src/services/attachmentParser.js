import { extractFromEmail } from './email/parser.js';

// Heavy parsing libraries are lazy-loaded to avoid bundling issues on Vercel serverless.
// These are only needed when processing email attachments (not for API routes).
let pdfParse;
let mammoth;
let XLSX;

async function getPdfParser() {
  if (!pdfParse) {
    const mod = await import('pdf-parse');
    pdfParse = mod.PDFParse;
  }
  return pdfParse;
}

async function getMammoth() {
  if (!mammoth) {
    const mod = await import('mammoth');
    mammoth = mod.default || mod;
  }
  return mammoth;
}

async function getXLSX() {
  if (!XLSX) {
    const mod = await import('xlsx');
    XLSX = mod;
  }
  return XLSX;
}

/**
 * Parse a PDF buffer and extract text content.
 *
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<string>} Extracted text
 */
export async function parsePDF(buffer) {
  try {
    const PDFParseCls = await getPdfParser();
    const parser = new PDFParseCls({ data: buffer });
    const data = await parser.getText();
    return data.text || '';
  } catch (err) {
    console.error('PDF parse error:', err.message);
    return '';
  }
}

/**
 * Parse a Word document buffer (.docx) and extract text content.
 *
 * @param {Buffer} buffer - Word document buffer
 * @returns {Promise<string>} Extracted text
 */
export async function parseWord(buffer) {
  try {
    const mam = await getMammoth();
    const result = await mam.extractRawText({ buffer });
    return result.value || '';
  } catch (err) {
    console.error('Word parse error:', err.message);
    return '';
  }
}

/**
 * Parse an Excel buffer (.xlsx/.xls) and extract text content.
 * Concatenates all cells from all sheets into a single string.
 *
 * @param {Buffer} buffer - Excel file buffer
 * @returns {string} Extracted text
 */
export async function parseExcel(buffer) {
  try {
    const xlsx = await getXLSX();
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const textParts = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      // Convert sheet to CSV-like text for extraction
      const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
      textParts.push(csv);
    }

    return textParts.join('\n');
  } catch (err) {
    console.error('Excel parse error:', err.message);
    return '';
  }
}

/**
 * Parse an attachment buffer based on its content type and extract text.
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} contentType - MIME content type
 * @returns {Promise<string>} Extracted text content
 */
export async function parseAttachmentContent(buffer, contentType) {
  if (!buffer) return '';

  const type = (contentType || '').toLowerCase();

  if (type.includes('pdf')) {
    return parsePDF(buffer);
  }

  if (
    type.includes('msword') ||
    type.includes('wordprocessingml') ||
    type.includes('docx')
  ) {
    return parseWord(buffer);
  }

  if (
    type.includes('spreadsheet') ||
    type.includes('excel') ||
    type.includes('xlsx') ||
    type.includes('xls')
  ) {
    return parseExcel(buffer);
  }

  // Unknown type - return empty
  return '';
}

/**
 * Parse an attachment and extract structured logistics data.
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} contentType - MIME content type
 * @returns {Promise<object>} Extracted fields with confidence flags
 */
export async function parseAndExtract(buffer, contentType) {
  const text = await parseAttachmentContent(buffer, contentType);
  if (!text) return null;
  return extractFromEmail(text);
}
