/**
 * Email classification service.
 * Classifies inbound emails into categories for routing and processing.
 *
 * Categories:
 * - BOUNCE: delivery failure notifications
 * - AUTO_REPLY: out-of-office and auto-response messages
 * - BOOKING: logistics booking requests
 * - QUERY: replies to existing threads without booking data
 * - NOISE: auto-reply/junk that should be discarded
 * - UNCLASSIFIED: everything else, goes to triage queue
 */

// Patterns for bounce detection
const BOUNCE_FROM_PATTERNS = [
  /mailer-daemon/i,
  /postmaster/i,
  /mail delivery/i,
  /automated-notification/i,
];

const BOUNCE_SUBJECT_PATTERNS = [
  /undeliverable/i,
  /delivery failed/i,
  /failure notice/i,
  /returned mail/i,
  /delivery status notification/i,
  /mail delivery failed/i,
  /undelivered mail/i,
  /message not delivered/i,
  /delivery failure/i,
];

// Patterns for auto-reply detection
const AUTO_REPLY_SUBJECT_PATTERNS = [
  /out of office/i,
  /out-of-office/i,
  /automatic reply/i,
  /auto[- ]?reply/i,
  /auto[- ]?response/i,
  /away from (?:the )?office/i,
  /on vacation/i,
  /on leave/i,
  /i am currently unavailable/i,
];

// Logistics keywords for booking classification
const BOOKING_KEYWORDS = [
  /\bcollection\b/i,
  /\bdeliver(?:y|ies)\b/i,
  /\bpallet(?:s)?\b/i,
  /\bhazardous\b/i,
  /\bvehicle\b/i,
  /\bweight\b/i,
  /\bdimensions?\b/i,
  /\bconsignment\b/i,
  /\btailift\b/i,
  /\btail lift\b/i,
  /\bcurtain\s*side\b/i,
  /\bfreight\b/i,
  /\bhaulage\b/i,
  /\blogistics\b/i,
  /\bshipment\b/i,
  /\btransport(?:ation)?\b/i,
  /\bgoods\b/i,
  /\bcargo\b/i,
  /\bmanifest\b/i,
  /\bpostcode\b/i,
  /\bvan\b/i,
  /\bartic\b/i,
  /\brigid\b/i,
  /\bLuton\b/i,
  /\bflatbed\b/i,
  /\bquote\b/i,
];

// File types that indicate a booking
const BOOKING_ATTACHMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const BOOKING_ATTACHMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];

/**
 * Classify an inbound email.
 *
 * @param {object} email - Parsed email object with from_address, subject, body_text, headers, attachments, in_reply_to
 * @returns {object} { classification: string, reason: string }
 */
export function classifyEmail(email) {
  const { from_address, subject, body_text, headers, attachments, in_reply_to } = email;
  const fromLower = (from_address || '').toLowerCase();
  const subjectStr = subject || '';
  const bodyStr = body_text || '';

  // 1. Check for BOUNCE
  const isBounceFrom = BOUNCE_FROM_PATTERNS.some((p) => p.test(fromLower));
  const isBounceSubject = BOUNCE_SUBJECT_PATTERNS.some((p) => p.test(subjectStr));

  if (isBounceFrom || isBounceSubject) {
    return {
      classification: 'bounce',
      reason: isBounceFrom
        ? `From address matches bounce pattern: ${fromLower}`
        : `Subject matches bounce pattern: ${subjectStr}`,
    };
  }

  // 2. Check for AUTO_REPLY
  const autoSubmitted = headers?.['auto-submitted'];
  const precedence = headers?.precedence;
  const isAutoHeader =
    (autoSubmitted && autoSubmitted !== 'no') ||
    (precedence && ['auto_reply', 'bulk', 'junk'].includes(precedence));
  const isAutoSubject = AUTO_REPLY_SUBJECT_PATTERNS.some((p) => p.test(subjectStr));

  if (isAutoHeader || isAutoSubject) {
    // Auto-replies are classified as NOISE (to be discarded)
    return {
      classification: 'noise',
      reason: isAutoHeader
        ? `Auto-reply detected via headers (auto-submitted: ${autoSubmitted}, precedence: ${precedence})`
        : `Subject matches auto-reply pattern: ${subjectStr}`,
    };
  }

  // 3. Check for BOOKING - logistics keywords in subject or body
  const combinedText = `${subjectStr} ${bodyStr}`;
  const matchingKeywords = BOOKING_KEYWORDS.filter((p) => p.test(combinedText));

  // Check for booking-related attachments
  const hasBookingAttachment = (attachments || []).some((att) => {
    const contentType = (att.content_type || '').toLowerCase();
    const filename = (att.filename || '').toLowerCase();
    return (
      BOOKING_ATTACHMENT_TYPES.some((t) => contentType.includes(t)) ||
      BOOKING_ATTACHMENT_EXTENSIONS.some((ext) => filename.endsWith(ext))
    );
  });

  if (matchingKeywords.length >= 2 || hasBookingAttachment) {
    return {
      classification: 'booking',
      reason: hasBookingAttachment
        ? `Has booking attachment(s): ${(attachments || []).map((a) => a.filename).join(', ')}`
        : `Matched ${matchingKeywords.length} logistics keywords in email body`,
    };
  }

  // 4. Check for QUERY - reply to an existing thread but no booking data
  if (in_reply_to) {
    return {
      classification: 'query',
      reason: `Reply to existing thread (In-Reply-To: ${in_reply_to})`,
    };
  }

  // 5. If a single booking keyword matched, still classify as potential booking
  if (matchingKeywords.length === 1) {
    return {
      classification: 'unclassified',
      reason: `Only 1 logistics keyword matched - needs manual review`,
    };
  }

  // 6. UNCLASSIFIED - goes to triage queue
  return {
    classification: 'unclassified',
    reason: 'No classification patterns matched - sent to triage queue',
  };
}
