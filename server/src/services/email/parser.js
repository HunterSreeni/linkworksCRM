/**
 * Email data extraction service.
 * Extracts structured logistics data from email body text (including trails - do NOT strip them).
 *
 * Each extracted field includes a confidence flag:
 * - "extracted": high confidence, pattern matched clearly
 * - "uncertain": pattern matched but may be ambiguous
 * - "missing": field not found in the email
 */

// UK postcode regex pattern
const UK_POSTCODE = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/gi;

// Address patterns - look for labelled addresses or multi-line UK addresses
const COLLECTION_ADDRESS_PATTERNS = [
  /collect(?:ion)?\s*(?:address|from|point|site)[:\s]*([^\n]+(?:\n[^\n]{5,}){0,3})/i,
  /pick\s*up\s*(?:address|from|point|location)[:\s]*([^\n]+(?:\n[^\n]{5,}){0,3})/i,
  /from[:\s]+([^\n]*?[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}[^\n]*)/i,
];

const DELIVERY_ADDRESS_PATTERNS = [
  /deliver(?:y|ing)?\s*(?:address|to|point|site|destination)[:\s]*([^\n]+(?:\n[^\n]{5,}){0,3})/i,
  /drop\s*(?:off)?\s*(?:address|to|point|location)[:\s]*([^\n]+(?:\n[^\n]{5,}){0,3})/i,
  /(?:ship|send)\s*(?:to|address)[:\s]*([^\n]+(?:\n[^\n]{5,}){0,3})/i,
  /to[:\s]+([^\n]*?[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}[^\n]*)/i,
];

// Date patterns - UK format (DD/MM/YYYY, DD-MM-YYYY, DD Month YYYY)
const DATE_PATTERNS = [
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g,
  /(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4})/gi,
];

const COLLECTION_DATE_PATTERNS = [
  /collect(?:ion)?\s*(?:date|time|on)[:\s]*([^\n]+)/i,
  /pick\s*up\s*(?:date|time|on)[:\s]*([^\n]+)/i,
];

const DELIVERY_DATE_PATTERNS = [
  /deliver(?:y)?\s*(?:date|time|by|on|before)[:\s]*([^\n]+)/i,
  /drop\s*(?:off)?\s*(?:date|time|by|on)[:\s]*([^\n]+)/i,
  /required\s*(?:date|by|on|before)[:\s]*([^\n]+)/i,
];

// Weight patterns
const WEIGHT_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilos?|kilograms?)/i,
  /(\d+(?:\.\d+)?)\s*(?:tonnes?|t)\b/i,
  /weight[:\s]*(\d+(?:\.\d+)?)\s*(?:kg|kgs|tonnes?|t)?/i,
];

// Dimensions patterns
const DIMENSION_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm|m|metres?|meters?)?/i,
  /dimensions?[:\s]*([\d.]+\s*[xX]\s*[\d.]+(?:\s*[xX]\s*[\d.]+)?[^\n]*)/i,
  /(?:L|length)[:\s]*(\d+(?:\.\d+)?)\s*[xX]\s*(?:W|width)[:\s]*(\d+(?:\.\d+)?)\s*[xX]\s*(?:H|height)[:\s]*(\d+(?:\.\d+)?)/i,
];

// Quantity patterns
const QUANTITY_PATTERNS = [
  /(\d+)\s*(?:pallet|pallets|plt|plts)/i,
  /(\d+)\s*(?:items?|pieces?|pcs|units?|parcels?|packages?|boxes?|cartons?|crates?)/i,
  /quantity[:\s]*(\d+)/i,
  /qty[:\s]*(\d+)/i,
];

// Vehicle type patterns
const VEHICLE_TYPES = [
  'artic', 'articulated', 'rigid', 'luton', 'sprinter', 'van', 'flatbed',
  'curtain side', 'curtainside', 'curtain-side', 'box van', 'hiab',
  'moffett', 'tail lift', 'tailift', 'tautliner', 'low loader',
  '7.5t', '18t', '26t', '44t', 'small van', 'large van', 'xlwb',
];

const VEHICLE_PATTERN = new RegExp(`\\b(${VEHICLE_TYPES.join('|')})\\b`, 'gi');

// Hazardous patterns
const HAZARDOUS_PATTERNS = [
  /hazardous[:\s]*(?:yes|true|y)/i,
  /\bADR\b/i,
  /\bDGN\b/i,
  /dangerous\s*goods/i,
  /\bUN\s*\d{4}\b/i,
  /hazmat/i,
];

const NON_HAZARDOUS_PATTERNS = [
  /hazardous[:\s]*(?:no|false|n|none|n\/a)/i,
  /non[- ]?hazardous/i,
  /no\s*dangerous\s*goods/i,
];

// Reference number patterns
const CUSTOMER_REF_PATTERNS = [
  /\b(?:customer|cust|your)\s*ref(?:erence)?(?:\s*(?:no|number|#|:))?[:\s]*([A-Z0-9][A-Z0-9\-\/]{2,})/i,
  /\b(?:order|po)\s*(?:no\.?|number|#|:)\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i,
  /\bref[:\s]+([A-Z0-9][A-Z0-9\-\/]{3,})/i,
];

const ACCOUNT_CODE_PATTERNS = [
  /account\s*(?:code|no|number|#|:)?[:\s]*([A-Z0-9\-\/]+)/i,
  /a\/c\s*(?:code|no|number)?[:\s]*([A-Z0-9\-\/]+)/i,
];

/**
 * Create an extraction result field.
 */
function field(value, confidence) {
  return { value: value || null, confidence };
}

/**
 * Try to match patterns against text and return the first match.
 */
function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract structured logistics data from email body text.
 * Does NOT strip email trails - processes the full body including forwarded/replied content.
 *
 * @param {string} bodyText - Full email body text
 * @returns {object} Extracted fields with confidence flags
 */
export function extractFromEmail(bodyText) {
  if (!bodyText || bodyText.trim().length === 0) {
    return emptyResult();
  }

  const text = bodyText;

  // Extract collection address
  const collectionAddr = firstMatch(text, COLLECTION_ADDRESS_PATTERNS);

  // Extract delivery address
  const deliveryAddr = firstMatch(text, DELIVERY_ADDRESS_PATTERNS);

  // Extract collection date/time
  const collectionDate = firstMatch(text, COLLECTION_DATE_PATTERNS);

  // Extract delivery date/time
  const deliveryDate = firstMatch(text, DELIVERY_DATE_PATTERNS);

  // Extract hazardous status
  const isHazardous = HAZARDOUS_PATTERNS.some((p) => p.test(text));
  const isNonHazardous = NON_HAZARDOUS_PATTERNS.some((p) => p.test(text));
  let hazardousValue = null;
  let hazardousConfidence = 'missing';
  if (isHazardous && !isNonHazardous) {
    hazardousValue = true;
    hazardousConfidence = 'extracted';
  } else if (isNonHazardous) {
    hazardousValue = false;
    hazardousConfidence = 'extracted';
  } else if (isHazardous && isNonHazardous) {
    hazardousValue = true;
    hazardousConfidence = 'uncertain';
  }

  // Extract weight
  const weightMatch = firstMatch(text, WEIGHT_PATTERNS);

  // Extract dimensions
  const dimensionsMatch = firstMatch(text, DIMENSION_PATTERNS);

  // Extract quantity
  const quantityMatch = firstMatch(text, QUANTITY_PATTERNS);

  // Extract vehicle type
  const vehicleMatches = text.match(VEHICLE_PATTERN);
  const vehicleType = vehicleMatches ? vehicleMatches[0] : null;

  // Extract customer reference
  const customerRef = firstMatch(text, CUSTOMER_REF_PATTERNS);

  // Extract account code
  const accountCode = firstMatch(text, ACCOUNT_CODE_PATTERNS);

  return {
    collection_address: collectionAddr
      ? field(collectionAddr, 'extracted')
      : field(null, 'missing'),
    delivery_address: deliveryAddr
      ? field(deliveryAddr, 'extracted')
      : field(null, 'missing'),
    collection_date: collectionDate
      ? field(collectionDate, 'extracted')
      : field(null, 'missing'),
    delivery_date: deliveryDate
      ? field(deliveryDate, 'extracted')
      : field(null, 'missing'),
    hazardous: field(hazardousValue, hazardousConfidence),
    weight: weightMatch
      ? field(weightMatch, 'extracted')
      : field(null, 'missing'),
    dimensions: dimensionsMatch
      ? field(dimensionsMatch, 'extracted')
      : field(null, 'missing'),
    quantity: quantityMatch
      ? field(quantityMatch, 'extracted')
      : field(null, 'missing'),
    vehicle_type: vehicleType
      ? field(vehicleType, 'extracted')
      : field(null, 'missing'),
    customer_ref_number: customerRef
      ? field(customerRef, 'extracted')
      : field(null, 'missing'),
    account_code: accountCode
      ? field(accountCode, 'extracted')
      : field(null, 'missing'),
  };
}

/**
 * Return an empty extraction result with all fields missing.
 */
function emptyResult() {
  const fields = [
    'collection_address', 'delivery_address', 'collection_date', 'delivery_date',
    'hazardous', 'weight', 'dimensions', 'quantity', 'vehicle_type',
    'customer_ref_number', 'account_code',
  ];
  const result = {};
  for (const f of fields) {
    result[f] = field(null, 'missing');
  }
  return result;
}
