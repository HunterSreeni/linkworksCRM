// ImapFlow and mailparser are lazy-loaded to avoid bundling issues on Vercel serverless
let ImapFlow;
let simpleParser;

async function loadImapDeps() {
  if (!ImapFlow) {
    const imapModule = await import('imapflow');
    ImapFlow = imapModule.ImapFlow;
  }
  if (!simpleParser) {
    const mailModule = await import('mailparser');
    simpleParser = mailModule.simpleParser;
  }
}

/**
 * Base email adapter interface.
 * All email adapters must implement these methods.
 */
class EmailAdapter {
  async connect() {
    throw new Error('connect() not implemented');
  }

  async disconnect() {
    throw new Error('disconnect() not implemented');
  }

  /**
   * Fetch new emails since the given UID.
   * @param {string|number} sinceUid - Fetch emails with UID greater than this value
   * @returns {Promise<Array>} Array of parsed email objects
   */
  async fetchNewEmails(sinceUid) {
    throw new Error('fetchNewEmails() not implemented');
  }
}

/**
 * IMAP email adapter - connects via IMAP, polls inbox, fetches emails with attachments.
 */
class ImapAdapter extends EmailAdapter {
  constructor() {
    super();
    this.client = null;
  }

  async connect() {
    await loadImapDeps();
    this.client = new ImapFlow({
      host: process.env.IMAP_HOST,
      port: parseInt(process.env.IMAP_PORT) || 993,
      secure: process.env.IMAP_TLS !== 'false',
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD,
      },
      logger: false,
    });

    // ImapFlow emits 'error' asynchronously on the underlying socket (e.g.
    // timeout, EPIPE). An unhandled 'error' event crashes the Node process,
    // so attach a listener that logs and lets the next poll cycle reconnect.
    this.client.on('error', (err) => {
      console.error('[IMAP] Client error (will reconnect on next poll):', err?.message || err);
    });

    await this.client.connect();
    console.log('[IMAP] Connected to', process.env.IMAP_HOST);
  }

  async disconnect() {
    if (this.client) {
      await this.client.logout();
      console.log('[IMAP] Disconnected');
    }
  }

  async fetchNewEmails(sinceUid = 0) {
    const emails = [];

    try {
      const lock = await this.client.getMailboxLock('INBOX');

      try {
        // Build search criteria - fetch emails with UID greater than sinceUid
        const searchCriteria = sinceUid > 0 ? { uid: `${sinceUid + 1}:*` } : { all: true };

        // Limit to last 50 if fetching all (first run)
        let uids = [];
        for await (const message of this.client.fetch(searchCriteria, {
          uid: true,
          envelope: true,
          source: true,
        })) {
          const parsed = await simpleParser(message.source);

          const attachments = (parsed.attachments || []).map((att) => ({
            filename: att.filename || 'unnamed',
            content_type: att.contentType,
            size: att.size,
            content: att.content, // Buffer
          }));

          emails.push({
            uid: message.uid,
            message_id: parsed.messageId || null,
            in_reply_to: parsed.inReplyTo || null,
            references: parsed.references || [],
            from_address: parsed.from?.text || '',
            from_name: parsed.from?.value?.[0]?.name || '',
            to_address: parsed.to?.text || '',
            subject: parsed.subject || '',
            body_text: parsed.text || '',
            body_html: parsed.html || '',
            date: parsed.date || new Date(),
            headers: {
              'auto-submitted': parsed.headers?.get('auto-submitted') || null,
              'x-auto-response-suppress': parsed.headers?.get('x-auto-response-suppress') || null,
              precedence: parsed.headers?.get('precedence') || null,
            },
            attachments,
          });
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error('[IMAP] Fetch error:', err);
      throw err;
    }

    return emails;
  }
}

/**
 * Microsoft Graph API email adapter - placeholder implementation.
 * When fully implemented, this will use the Graph API to fetch emails from an M365 mailbox.
 */
class GraphApiAdapter extends EmailAdapter {
  constructor() {
    super();
    // TODO: Store access token and refresh token
    // this.accessToken = null;
  }

  async connect() {
    // TODO: Authenticate with Microsoft Graph API
    // POST https://login.microsoftonline.com/{GRAPH_TENANT_ID}/oauth2/v2.0/token
    // Body: {
    //   client_id: GRAPH_CLIENT_ID,
    //   client_secret: GRAPH_CLIENT_SECRET,
    //   scope: 'https://graph.microsoft.com/.default',
    //   grant_type: 'client_credentials'
    // }
    // Store the access_token from the response
    throw new Error('Graph API adapter not yet configured. Set GRAPH_API_ENABLED=false to use IMAP.');
  }

  async disconnect() {
    // TODO: Revoke tokens if needed
    // No persistent connection to close with REST API
  }

  async fetchNewEmails(sinceUid = 0) {
    // TODO: Fetch emails from Graph API
    // GET https://graph.microsoft.com/v1.0/users/{GRAPH_MAILBOX}/messages
    // Headers: Authorization: Bearer {access_token}
    // Query params: $filter=receivedDateTime gt {lastPollTime}&$top=50&$orderby=receivedDateTime desc
    // $select=id,subject,from,toRecipients,body,receivedDateTime,hasAttachments,internetMessageId,conversationId
    //
    // For attachments:
    // GET https://graph.microsoft.com/v1.0/users/{GRAPH_MAILBOX}/messages/{messageId}/attachments
    //
    // For marking as read:
    // PATCH https://graph.microsoft.com/v1.0/users/{GRAPH_MAILBOX}/messages/{messageId}
    // Body: { isRead: true }
    throw new Error('Graph API adapter not yet implemented.');
  }
}

/**
 * Factory function - returns the appropriate email adapter based on environment configuration.
 */
export function getEmailAdapter() {
  if (process.env.GRAPH_API_ENABLED === 'true') {
    return new GraphApiAdapter();
  }
  return new ImapAdapter();
}

export { EmailAdapter, ImapAdapter, GraphApiAdapter };
