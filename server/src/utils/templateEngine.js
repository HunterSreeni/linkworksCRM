/**
 * Template placeholder replacement engine.
 * Replaces {{placeholder}} tokens in template strings with provided values.
 */

const SUPPORTED_PLACEHOLDERS = [
  'docket_number',
  'customer_ref',
  'account_code',
  'collection_address',
  'delivery_address',
  'delivery_date',
  'vehicle_type',
  'hazardous',
  'weight',
  'customer_name',
];

/**
 * Replace all {{placeholder}} tokens in a string with values from the provided map.
 * Unknown placeholders are left as-is.
 *
 * @param {string} template - The template string with {{placeholder}} tokens
 * @param {object} values - Key-value map of placeholder names to replacement values
 * @returns {string} The rendered string
 */
export function renderTemplate(template, values = {}) {
  if (!template) return '';

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in values && values[key] !== null && values[key] !== undefined) {
      return String(values[key]);
    }
    return match; // Leave unresolved placeholders as-is
  });
}

/**
 * Render both subject and body of a template.
 *
 * @param {object} template - Object with subject and body fields
 * @param {object} values - Placeholder values
 * @returns {object} Rendered { subject, body }
 */
export function renderEmailTemplate(template, values = {}) {
  // Support both schema column names (subject_template/body_template) and
  // short aliases (subject/body) used when callers pass raw strings from
  // the preview endpoint.
  const subjectSrc = template.subject_template ?? template.subject ?? '';
  const bodySrc = template.body_template ?? template.body ?? '';
  return {
    subject: renderTemplate(subjectSrc, values),
    body: renderTemplate(bodySrc, values),
  };
}

/**
 * List all placeholders found in a template string.
 *
 * @param {string} template - The template string
 * @returns {string[]} Array of placeholder names found
 */
export function listPlaceholders(template) {
  if (!template) return [];
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.replace(/[{}]/g, '')))];
}

export { SUPPORTED_PLACEHOLDERS };
