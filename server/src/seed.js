/**
 * Linkworks CRM - Seed Data Script
 *
 * Populates the Supabase database with realistic sample data for demo purposes.
 *
 * Usage:
 *   node src/seed.js          # Seed data (skips existing records)
 *   node src/seed.js --clear   # Wipe all seeded data and re-seed
 *
 * IMPORTANT: This script uses the service_role key which bypasses RLS.
 * The profiles table has a FK to auth.users. This script creates auth users
 * via supabase admin API so the FK constraint is satisfied. If those users
 * already exist it skips creation.
 *
 * If you prefer to create auth users manually in the Supabase Dashboard, do
 * that first, then update the UUIDs in PROFILES below to match, before running
 * this script.
 */

import 'dotenv/config';
import crypto from 'crypto';
import { supabaseAdmin } from './config/supabase.js';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const CLEAR_MODE = process.argv.includes('--clear');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function uuid() {
  return crypto.randomUUID();
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randomInt(7, 19), randomInt(0, 59), randomInt(0, 59));
  return d.toISOString();
}

function futureDate(fromIso, daysAhead) {
  const d = new Date(fromIso);
  d.setDate(d.getDate() + daysAhead);
  d.setHours(randomInt(8, 17), randomInt(0, 59), 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Static UUIDs (deterministic so re-runs are idempotent)
// ---------------------------------------------------------------------------
const USER_IDS = {
  admin1: '11111111-1111-1111-1111-111111111111',
  admin2: '22222222-2222-2222-2222-222222222222',
  member1: '33333333-3333-3333-3333-333333333001',
  member2: '33333333-3333-3333-3333-333333333002',
  member3: '33333333-3333-3333-3333-333333333003',
  member4: '33333333-3333-3333-3333-333333333004',
  member5: '33333333-3333-3333-3333-333333333005',
  member6: '33333333-3333-3333-3333-333333333006',
  member7: '33333333-3333-3333-3333-333333333007',
  member8: '33333333-3333-3333-3333-333333333008',
};

const ALL_USER_IDS = Object.values(USER_IDS);
const MEMBER_IDS = ALL_USER_IDS.slice(2);

// ---------------------------------------------------------------------------
// Profile definitions
// ---------------------------------------------------------------------------
const PROFILES = [
  { id: USER_IDS.admin1, full_name: 'Balaji S', email: 'balaji@linkworks.co.uk', role: 'admin' },
  { id: USER_IDS.admin2, full_name: 'Sreeni K', email: 'sreeni@linkworks.co.uk', role: 'admin' },
  { id: USER_IDS.member1, full_name: 'James Wilson', email: 'james.wilson@linkworks.co.uk', role: 'member' },
  { id: USER_IDS.member2, full_name: 'Sarah Thompson', email: 'sarah.thompson@linkworks.co.uk', role: 'member' },
  { id: USER_IDS.member3, full_name: 'David Clarke', email: 'david.clarke@linkworks.co.uk', role: 'member' },
  { id: USER_IDS.member4, full_name: 'Emma Richards', email: 'emma.richards@linkworks.co.uk', role: 'member' },
  { id: USER_IDS.member5, full_name: 'Michael Brown', email: 'michael.brown@linkworks.co.uk', role: 'member' },
  { id: USER_IDS.member6, full_name: 'Lucy Foster', email: 'lucy.foster@linkworks.co.uk', role: 'member' },
  { id: USER_IDS.member7, full_name: 'Thomas Wright', email: 'thomas.wright@linkworks.co.uk', role: 'member' },
  { id: USER_IDS.member8, full_name: 'Rebecca Green', email: 'rebecca.green@linkworks.co.uk', role: 'member' },
];

// ---------------------------------------------------------------------------
// UK Addresses
// ---------------------------------------------------------------------------
const COLLECTION_ADDRESSES = [
  '14 King Street, London, EC2V 8DS',
  'Unit 3, Heartlands Business Park, Birmingham, B7 4AG',
  '22 Portland Street, Manchester, M1 3BE',
  '8 Wellington Road, Leeds, LS1 4AP',
  'Bay 5, Avonmouth Industrial Estate, Bristol, BS11 9QD',
  '97 Dale Street, Liverpool, L2 2JD',
  'Haymarket Logistics Centre, Edinburgh, EH1 3GE',
  '45 West George Street, Glasgow, G2 1BP',
  '11 Churchill Way, Cardiff, CF10 2HH',
  'Ocean Village, Southampton, SO14 3TL',
  'Unit 12, Trafford Park, Manchester, M17 1HH',
  '88 George Street, Edinburgh, EH2 3DF',
];

const DELIVERY_ADDRESSES = [
  '29 Commercial Road, London, E1 1LB',
  'Warehouse 7, Fort Dunlop, Birmingham, B24 9FD',
  '55 Deansgate, Manchester, M3 2FF',
  '3 City Walk, Leeds, LS11 9AT',
  'Temple Meads Business Park, Bristol, BS1 6QF',
  'Albert Dock Distribution, Liverpool, L3 4AF',
  'Leith Docks, Edinburgh, EH6 6RA',
  '12 Broomielaw, Glasgow, G1 5QR',
  'Cardiff Bay Logistics, Cardiff, CF10 5AL',
  'Ocean Quay, Southampton, SO14 3QG',
  'Unit 4, Kingsway Business Park, Manchester, M19 1BB',
  'Granton Harbour, Edinburgh, EH5 1HF',
];

// ---------------------------------------------------------------------------
// Customer domains and names
// ---------------------------------------------------------------------------
const CUSTOMER_COMPANIES = [
  { name: 'Apex Industrial Solutions', domain: 'apexindustrial.co.uk', contact: 'Mark Davies' },
  { name: 'Northern Freight Ltd', domain: 'northernfreight.co.uk', contact: 'Helen Carter' },
  { name: 'Sterling Logistics Group', domain: 'sterlinglogistics.com', contact: 'Paul Mitchell' },
  { name: 'Caledonian Supply Chain', domain: 'caledoniansupply.co.uk', contact: 'Fiona MacGregor' },
  { name: 'Thames Valley Distribution', domain: 'tvdistribution.co.uk', contact: 'Andrew Phillips' },
  { name: 'Pennine Transport Services', domain: 'penninetransport.co.uk', contact: 'Karen Booth' },
  { name: 'Harbourside Warehousing', domain: 'harboursideware.co.uk', contact: 'Simon Fletcher' },
  { name: 'Midlands Express Cargo', domain: 'midlandsexpress.co.uk', contact: 'Claire Bennett' },
  { name: 'Celtic Haulage Ltd', domain: 'celtichaulage.co.uk', contact: 'Rhys Evans' },
  { name: 'Crown Shipping Solutions', domain: 'crownshipping.co.uk', contact: 'Olivia Hunt' },
];

const VEHICLE_TYPES = ['standard', 'tailift', 'oog', 'curtain_side'];

// ---------------------------------------------------------------------------
// Email generation helpers
// ---------------------------------------------------------------------------
function makeInboundEmail(idx, customer, collAddr, delAddr, dayOffset, classification) {
  const id = uuid();
  const ref = randomPick([
    `CRN-${randomInt(10000, 99999)}`,
    `CR/2026/${String(randomInt(1, 999)).padStart(3, '0')}`,
    `REF-${randomInt(10000, 99999)}`,
    null,
    null,
  ]);
  const weight = `${randomInt(100, 5000)}kg`;
  const vehicle = randomPick(VEHICLE_TYPES);
  const hasAttachments = Math.random() > 0.7;
  const receivedAt = daysAgo(dayOffset);

  const bodyClean = [
    `Hi,`,
    ``,
    `Could you please arrange collection and delivery for the following:`,
    ``,
    `Collection: ${collAddr}`,
    `Delivery: ${delAddr}`,
    `Weight: ${weight}`,
    `Vehicle required: ${vehicle}`,
    ref ? `Our reference: ${ref}` : '',
    ``,
    `Please confirm availability and provide a docket number.`,
    ``,
    `Kind regards,`,
    `${customer.contact}`,
    `${customer.name}`,
  ].filter(Boolean).join('\n');

  const bodyRaw = [
    `From: ${customer.contact} <${customer.contact.toLowerCase().replace(' ', '.')}@${customer.domain}>`,
    `To: bookings@linkworks.co.uk`,
    `Date: ${new Date(receivedAt).toUTCString()}`,
    `Subject: Delivery request${ref ? ' - ' + ref : ''}`,
    ``,
    bodyClean,
    ``,
    `---`,
    `This email and any attachments are confidential.`,
    `${customer.name} - Registered in England No. ${randomInt(1000000, 9999999)}`,
  ].join('\n');

  return {
    id,
    graph_message_id: `seed-inbound-${idx}-${Date.now()}`,
    thread_id: `seed-thread-${idx}`,
    direction: 'inbound',
    classification,
    subject: `Delivery request${ref ? ' - ' + ref : ''} from ${customer.name}`,
    from_address: `${customer.contact.toLowerCase().replace(' ', '.')}@${customer.domain}`,
    to_address: 'bookings@linkworks.co.uk',
    cc_address: null,
    body_raw: bodyRaw,
    body_clean: bodyClean,
    has_attachments: hasAttachments,
    is_processed: classification !== 'unclassified',
    received_at: receivedAt,
    processed_at: classification !== 'unclassified' ? futureDate(receivedAt, 0) : null,
    _meta: { ref, weight, vehicle, collAddr, delAddr, customer },
  };
}

function makeOutboundEmail(idx, inboundEmail, docketNumber, dayOffset) {
  const id = uuid();
  const sentAt = daysAgo(dayOffset);
  const ref = inboundEmail._meta.ref || `CRN-${randomInt(10000, 99999)}`;

  const bodyClean = [
    `Dear ${inboundEmail._meta.customer.contact},`,
    ``,
    `We are pleased to confirm your booking with the following details:`,
    ``,
    `Docket Number: ${docketNumber}`,
    `Customer Reference: ${ref}`,
    ``,
    `Collection: ${inboundEmail._meta.collAddr}`,
    `Delivery: ${inboundEmail._meta.delAddr}`,
    `Weight: ${inboundEmail._meta.weight}`,
    `Vehicle Type: ${inboundEmail._meta.vehicle}`,
    ``,
    `Please do not hesitate to contact us if you have any questions.`,
    ``,
    `Kind regards,`,
    `Linkworks Operations Team`,
  ].join('\n');

  const bodyRaw = [
    `From: bookings@linkworks.co.uk`,
    `To: ${inboundEmail.from_address}`,
    `Date: ${new Date(sentAt).toUTCString()}`,
    `Subject: RE: ${inboundEmail.subject}`,
    ``,
    bodyClean,
    ``,
    `--- Original Message ---`,
    inboundEmail.body_raw,
  ].join('\n');

  return {
    id,
    graph_message_id: `seed-outbound-${idx}-${Date.now()}`,
    thread_id: inboundEmail.thread_id,
    direction: 'outbound',
    classification: 'booking',
    subject: `RE: ${inboundEmail.subject}`,
    from_address: 'bookings@linkworks.co.uk',
    to_address: inboundEmail.from_address,
    cc_address: null,
    body_raw: bodyRaw,
    body_clean: bodyClean,
    has_attachments: false,
    is_processed: true,
    received_at: sentAt,
    processed_at: sentAt,
  };
}

// ---------------------------------------------------------------------------
// Build all seed data
// ---------------------------------------------------------------------------
function buildSeedData() {
  // --- Inbound emails (30) ---
  const classifications = [
    ...Array(20).fill('booking'),
    ...Array(3).fill('query'),
    ...Array(2).fill('bounce'),
    ...Array(2).fill('noise'),
    ...Array(3).fill('unclassified'),
  ];

  const inboundEmails = classifications.map((cls, idx) => {
    const customer = CUSTOMER_COMPANIES[idx % CUSTOMER_COMPANIES.length];
    const collAddr = COLLECTION_ADDRESSES[idx % COLLECTION_ADDRESSES.length];
    const delAddr = DELIVERY_ADDRESSES[idx % DELIVERY_ADDRESSES.length];
    const dayOffset = randomInt(1, 30);
    return makeInboundEmail(idx, customer, collAddr, delAddr, dayOffset, cls);
  });

  // --- Outbound emails (15) - replies to the first 15 booking inbound ---
  const bookingInbounds = inboundEmails.filter((e) => e.classification === 'booking');
  let docketSeq = 7304821;
  const outboundEmails = bookingInbounds.slice(0, 15).map((inb, idx) => {
    const docket = String(docketSeq + idx);
    const dayOffset = Math.max(0, randomInt(0, 5));
    return makeOutboundEmail(idx, inb, docket, dayOffset);
  });

  // --- Requests (25) ---
  // Status distribution: 5 draft, 5 confirmed, 5 processing, 5 replied, 3 closed, 2 delivery_failed
  const statusDistribution = [
    ...Array(5).fill('draft'),
    ...Array(5).fill('confirmed'),
    ...Array(5).fill('processing'),
    ...Array(5).fill('replied'),
    ...Array(3).fill('closed'),
    ...Array(2).fill('delivery_failed'),
  ];

  const requests = statusDistribution.map((status, idx) => {
    const inb = bookingInbounds[idx % bookingInbounds.length];
    const outb = (status === 'replied' || status === 'closed')
      ? outboundEmails[idx % outboundEmails.length]
      : null;

    const hasDocket = status === 'replied' || status === 'closed';
    const hasAccount = status === 'replied' || status === 'closed';
    const dayOffset = randomInt(1, 28);
    const createdAt = daysAgo(dayOffset);
    const collDatetime = futureDate(createdAt, randomInt(1, 5));
    const delDatetime = futureDate(collDatetime, randomInt(1, 3));

    const weight = `${randomInt(100, 5000)}kg`;
    const dims = `${randomInt(100, 300)}cm x ${randomInt(80, 200)}cm x ${randomInt(50, 180)}cm`;
    const qty = randomInt(1, 20);
    const vehicle = randomPick(VEHICLE_TYPES);
    const isHazardous = Math.random() > 0.8;

    const confidences = ['extracted', 'uncertain', 'missing'];
    const mainConf = randomPick(['extracted', 'extracted', 'extracted', 'uncertain']);

    const collAddr = COLLECTION_ADDRESSES[idx % COLLECTION_ADDRESSES.length];
    const delAddr = DELIVERY_ADDRESSES[idx % DELIVERY_ADDRESSES.length];

    const basePrices = { standard: 150, tailift: 200, oog: 350, curtain_side: 180 };
    const pricePerKg = { standard: 0.5, tailift: 0.6, oog: 0.75, curtain_side: 0.55 };
    const weightNum = parseInt(weight);
    let estimatedCost = basePrices[vehicle] + pricePerKg[vehicle] * weightNum;
    if (isHazardous) estimatedCost *= 1.6;
    estimatedCost = Math.round(estimatedCost * 100) / 100;

    return {
      id: uuid(),
      inbound_email_id: inb.id,
      outbound_email_id: outb ? outb.id : null,
      docket_number: hasDocket ? String(7304821 + idx) : null,
      customer_ref_number: inb._meta.ref || (Math.random() > 0.4 ? `CRN-${randomInt(10000, 99999)}` : null),
      account_code: hasAccount ? randomPick(['ACC-001', 'ACC-002', 'ACC-003', 'LW-2026-042', 'LW-2026-055', 'LW-2026-078']) : null,
      status,
      collection_address: collAddr,
      collection_address_confidence: mainConf,
      delivery_address: delAddr,
      delivery_address_confidence: mainConf,
      collection_datetime: collDatetime,
      collection_datetime_confidence: randomPick(confidences),
      delivery_datetime: delDatetime,
      delivery_datetime_confidence: randomPick(confidences),
      is_hazardous: isHazardous,
      is_hazardous_confidence: randomPick(['extracted', 'extracted', 'uncertain']),
      weight,
      weight_confidence: mainConf,
      dimensions: dims,
      dimensions_confidence: randomPick(confidences),
      quantity: qty,
      quantity_confidence: randomPick(confidences),
      vehicle,
      vehicle_confidence: mainConf,
      pricing_category: vehicle,
      estimated_cost: estimatedCost,
      assigned_to: status === 'draft' && Math.random() > 0.5 ? null : randomPick(MEMBER_IDS),
      confirmed_by: (status === 'replied' || status === 'closed') ? randomPick([USER_IDS.admin1, USER_IDS.admin2]) : null,
      created_at: createdAt,
      updated_at: status === 'draft' ? createdAt : daysAgo(Math.max(0, dayOffset - randomInt(0, 3))),
    };
  });

  // --- Audit log (50 entries) ---
  const auditActions = [
    { action: 'request.created', entity_type: 'request' },
    { action: 'request.status_changed', entity_type: 'request' },
    { action: 'request.assigned', entity_type: 'request' },
    { action: 'email.classified', entity_type: 'email' },
    { action: 'template.updated', entity_type: 'email_template' },
    { action: 'email.sent', entity_type: 'email' },
  ];

  const statusTransitions = [
    { old_value: 'draft', new_value: 'confirmed' },
    { old_value: 'confirmed', new_value: 'processing' },
    { old_value: 'processing', new_value: 'replied' },
    { old_value: 'replied', new_value: 'closed' },
    { old_value: 'processing', new_value: 'delivery_failed' },
  ];

  const auditLog = Array.from({ length: 50 }, (_, idx) => {
    const template = randomPick(auditActions);
    const userId = randomPick(ALL_USER_IDS);
    const entityId = template.entity_type === 'request'
      ? requests[idx % requests.length].id
      : template.entity_type === 'email'
        ? inboundEmails[idx % inboundEmails.length].id
        : uuid();

    let details = {};
    if (template.action === 'request.status_changed') {
      const t = randomPick(statusTransitions);
      details = { old_value: t.old_value, new_value: t.new_value };
    } else if (template.action === 'request.assigned') {
      details = { assigned_to: randomPick(MEMBER_IDS) };
    } else if (template.action === 'email.classified') {
      details = { classification: randomPick(['booking', 'query', 'bounce', 'noise']) };
    } else if (template.action === 'template.updated') {
      details = { template_name: randomPick(['standard_confirmation', 'early_closure', 'oog_confirmation']) };
    } else if (template.action === 'email.sent') {
      details = { to: randomPick(CUSTOMER_COMPANIES).domain };
    }

    return {
      id: uuid(),
      user_id: userId,
      action: template.action,
      entity_type: template.entity_type,
      entity_id: entityId,
      details,
      created_at: daysAgo(randomInt(0, 30)),
    };
  });

  return { inboundEmails, outboundEmails, requests, auditLog };
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

async function ensureAuthUser(profile) {
  // Try to create an auth user with a specific ID so it matches the profile.
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    id: profile.id,
    email: profile.email,
    password: 'SeedPassword123!',
    email_confirm: true,
    user_metadata: { full_name: profile.full_name },
  });

  if (error) {
    // If user already exists, try to look up their ID
    if (error.message?.includes('already been registered') ||
        error.message?.includes('duplicate') ||
        error.message?.includes('exists') ||
        error.status === 422) {
      // List users to find the existing one and update profile ID to match
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existing = listData?.users?.find(u => u.email === profile.email);
      if (existing) {
        profile.id = existing.id;
        console.log(`  Auth user already exists: ${profile.email} (id: ${existing.id})`);
        return true;
      }
      console.log(`  Auth user already exists: ${profile.email} - skipping`);
      return true;
    }
    console.error(`  Failed to create auth user ${profile.email}:`, error.message);
    return false;
  }

  // Update profile ID to match the auth user ID (in case Supabase ignored our id)
  if (data?.user?.id && data.user.id !== profile.id) {
    profile.id = data.user.id;
  }
  console.log(`  Created auth user: ${profile.email} (id: ${profile.id})`);
  return true;
}

async function clearAllSeededData() {
  console.log('\n--- Clearing all seeded data ---');

  // Order matters due to FK constraints
  const tables = ['audit_log', 'requests', 'attachments', 'emails', 'profiles'];

  for (const table of tables) {
    // Skip email_templates and pricing_rules - those are seeded by schema.sql
    const { error } = await supabaseAdmin.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error(`  Error clearing ${table}:`, error.message);
    } else {
      console.log(`  Cleared: ${table}`);
    }
  }

  // Delete auth users for our seed profiles
  for (const profile of PROFILES) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(profile.id);
    if (error && !error.message?.includes('not found')) {
      console.error(`  Error deleting auth user ${profile.email}:`, error.message);
    }
  }
  console.log('  Cleared: auth users');
}

async function seedProfiles() {
  console.log('\n--- Seeding profiles ---');

  for (const profile of PROFILES) {
    await ensureAuthUser(profile);
  }

  // Rebuild ID arrays after auth user lookup may have updated them
  const profileIds = PROFILES.map(p => p.id);
  ALL_USER_IDS.length = 0;
  ALL_USER_IDS.push(...profileIds);
  MEMBER_IDS.length = 0;
  MEMBER_IDS.push(...profileIds.slice(2));
  USER_IDS.admin1 = PROFILES[0].id;
  USER_IDS.admin2 = PROFILES[1].id;

  const { error } = await supabaseAdmin.from('profiles').upsert(
    PROFILES.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
      is_active: true,
    })),
    { onConflict: 'id' }
  );

  if (error) {
    console.error('  Error seeding profiles:', error.message);
    return false;
  }
  console.log(`  Inserted/updated ${PROFILES.length} profiles`);
  return true;
}

async function seedEmails(inboundEmails, outboundEmails) {
  console.log('\n--- Seeding emails ---');

  // Strip _meta before inserting
  const inboundRows = inboundEmails.map(({ _meta, ...rest }) => rest);
  const outboundRows = outboundEmails.map((e) => ({ ...e }));

  const allEmails = [...inboundRows, ...outboundRows];

  // Upsert based on graph_message_id to be idempotent
  // Supabase JS upsert needs onConflict on a unique column
  const { error } = await supabaseAdmin.from('emails').upsert(allEmails, {
    onConflict: 'graph_message_id',
  });

  if (error) {
    console.error('  Error seeding emails:', error.message);
    return false;
  }
  console.log(`  Inserted/updated ${inboundRows.length} inbound + ${outboundRows.length} outbound emails`);
  return true;
}

async function seedRequests(requests) {
  console.log('\n--- Seeding requests ---');

  const { error } = await supabaseAdmin.from('requests').upsert(requests, {
    onConflict: 'id',
  });

  if (error) {
    console.error('  Error seeding requests:', error.message);
    return false;
  }
  console.log(`  Inserted/updated ${requests.length} requests`);
  return true;
}

async function seedAuditLog(auditLog) {
  console.log('\n--- Seeding audit log ---');

  // Audit log is append-only. In clear mode we already wiped it.
  // In normal mode, just insert. If duplicates exist by id, upsert handles it.
  const { error } = await supabaseAdmin.from('audit_log').upsert(auditLog, {
    onConflict: 'id',
  });

  if (error) {
    console.error('  Error seeding audit_log:', error.message);
    return false;
  }
  console.log(`  Inserted/updated ${auditLog.length} audit log entries`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('==============================================');
  console.log('  Linkworks CRM - Seed Script');
  console.log('==============================================');
  console.log(`  Mode: ${CLEAR_MODE ? 'CLEAR + RE-SEED' : 'SEED (idempotent)'}`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('\nERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
    console.error('Copy .env.example to .env and fill in your Supabase credentials.');
    process.exit(1);
  }

  if (CLEAR_MODE) {
    await clearAllSeededData();
  }

  // Seed profiles first (updates IDs to match auth users)
  const profilesOk = await seedProfiles();

  // Build all data AFTER profiles are seeded so IDs are correct
  const { inboundEmails, outboundEmails, requests, auditLog } = buildSeedData();
  if (!profilesOk) {
    console.error('\nFailed to seed profiles. Aborting.');
    process.exit(1);
  }

  const emailsOk = await seedEmails(inboundEmails, outboundEmails);
  if (!emailsOk) {
    console.error('\nFailed to seed emails. Aborting.');
    process.exit(1);
  }

  const requestsOk = await seedRequests(requests);
  if (!requestsOk) {
    console.error('\nFailed to seed requests. Aborting.');
    process.exit(1);
  }

  await seedAuditLog(auditLog);

  console.log('\n==============================================');
  console.log('  Seed complete!');
  console.log('==============================================');
  console.log(`\n  Profiles:   ${PROFILES.length} (2 admins + 8 members)`);
  console.log(`  Emails:     ${inboundEmails.length} inbound + ${outboundEmails.length} outbound`);
  console.log(`  Requests:   ${requests.length}`);
  console.log(`  Audit log:  ${auditLog.length} entries`);
  console.log('\n  All seed users have password: SeedPassword123!');
  console.log('  Change passwords in the Supabase Dashboard for production use.\n');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
