/**
 * Template placeholder replacement engine.
 * Replaces {{placeholder}} tokens in template strings with provided values.
 */

const SUPPORTED_PLACEHOLDERS = [
  'docket_number',
  'customer_ref',
  'account_code',
  'collection_address',
  'collection_date',
  'delivery_address',
  'delivery_date',
  'vehicle_type',
  'hazardous',
  'weight',
  'dimensions',
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

  const renderedSubject = renderTemplate(subjectSrc, values);
  const renderedBody = renderTemplate(bodySrc, values);

  // Wrap in a styled HTML email layout so line breaks, spacing, and
  // structure render correctly in all email clients.
  const htmlBody = wrapInHtmlEmail(renderedBody, renderedSubject);

  return {
    subject: renderedSubject,
    body: htmlBody,
  };
}

/**
 * Wrap a plain-text email body in a responsive HTML email template.
 * Converts \n line breaks into proper HTML structure with sections
 * for booking details.
 */
function wrapInHtmlEmail(text, subject) {
  // Split into lines, detect "Key: Value" patterns for structured rendering
  const lines = text.split('\n');
  let bodyHtml = '';
  let inDetailBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      if (inDetailBlock) {
        bodyHtml += '</table></div>';
        inDetailBlock = false;
      }
      continue;
    }

    // Check if line is a "Label: Value" detail row
    const detailMatch = trimmed.match(/^([A-Za-z\s/]+):\s*(.+)$/);
    if (detailMatch && detailMatch[1].length < 30) {
      if (!inDetailBlock) {
        bodyHtml += '<div style="background-color:#f8f9fa;border-radius:8px;padding:16px;margin:12px 0;">';
        bodyHtml += '<table style="width:100%;border-collapse:collapse;">';
        inDetailBlock = true;
      }
      const label = detailMatch[1].trim();
      const value = detailMatch[2].trim();
      bodyHtml += `<tr>
        <td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;font-weight:600;">${label}</td>
        <td style="padding:6px 0;color:#1f2937;font-size:14px;">${value}</td>
      </tr>`;
    } else {
      if (inDetailBlock) {
        bodyHtml += '</table></div>';
        inDetailBlock = false;
      }
      bodyHtml += `<p style="margin:8px 0;color:#374151;font-size:14px;line-height:1.6;">${trimmed}</p>`;
    }
  }

  if (inDetailBlock) {
    bodyHtml += '</table></div>';
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background-color:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">
      <!-- Header -->
      <div style="background-color:#2563eb;padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">${subject || 'Linkworks Operations'}</h1>
      </div>
      <!-- Body -->
      <div style="padding:24px 32px;">
        ${bodyHtml}
      </div>
      <!-- Footer -->
      <div style="border-top:1px solid #e5e7eb;padding:16px 32px;background-color:#f9fafb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
          Linkworks Operations Team
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
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
