-- ============================================================================
-- Linkworks CRM - Supabase Database Schema
-- Logistics CRM for managing bookings, emails, and delivery requests
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'member');

CREATE TYPE request_status AS ENUM (
  'draft',
  'confirmed',
  'processing',
  'replied',
  'closed',
  'delivery_failed'
);

CREATE TYPE email_direction AS ENUM ('inbound', 'outbound');

CREATE TYPE email_classification AS ENUM (
  'booking',
  'query',
  'bounce',
  'noise',
  'auto_reply',
  'unclassified'
);

CREATE TYPE vehicle_type AS ENUM (
  'standard',
  'tailift',
  'oog',
  'curtain_side'
);

CREATE TYPE confidence_level AS ENUM ('extracted', 'uncertain', 'missing');

-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles - extends Supabase auth.users
-- ----------------------------------------------------------------------------
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        user_role DEFAULT 'member',
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE profiles IS 'User profiles extending Supabase auth.users';

-- ----------------------------------------------------------------------------
-- emails - ingested from Graph API or IMAP
-- ----------------------------------------------------------------------------
CREATE TABLE emails (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_message_id  TEXT UNIQUE,
  thread_id         TEXT,
  direction         email_direction NOT NULL,
  classification    email_classification DEFAULT 'unclassified',
  subject           TEXT,
  from_address      TEXT,
  to_address        TEXT,
  cc_address        TEXT,
  body_raw          TEXT,
  body_clean        TEXT,
  has_attachments   BOOLEAN DEFAULT false,
  is_processed      BOOLEAN DEFAULT false,
  received_at       TIMESTAMPTZ,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE emails IS 'Ingested emails from Graph API or IMAP with dedup on graph_message_id';
COMMENT ON COLUMN emails.graph_message_id IS 'Graph API message ID or IMAP UID for deduplication';
COMMENT ON COLUMN emails.body_raw IS 'Full email body including reply trails';
COMMENT ON COLUMN emails.body_clean IS 'Latest message only with trails stripped';

-- ----------------------------------------------------------------------------
-- attachments - files attached to emails
-- ----------------------------------------------------------------------------
CREATE TABLE attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id        UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  file_type       TEXT,
  file_size       INTEGER,
  storage_path    TEXT,
  parsed_content  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE attachments IS 'Email attachments stored in Supabase storage or local filesystem';
COMMENT ON COLUMN attachments.parsed_content IS 'Extracted text content from PDF, DOCX, XLSX, etc.';

-- ----------------------------------------------------------------------------
-- requests - booking/delivery requests extracted from emails
-- ----------------------------------------------------------------------------
CREATE TABLE requests (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_email_id                UUID REFERENCES emails(id),
  outbound_email_id               UUID REFERENCES emails(id),
  docket_number                   TEXT,
  customer_ref_number             TEXT,
  account_code                    TEXT,
  status                          request_status DEFAULT 'draft',

  -- addresses
  collection_address              TEXT,
  collection_address_confidence   confidence_level DEFAULT 'missing',
  delivery_address                TEXT,
  delivery_address_confidence     confidence_level DEFAULT 'missing',

  -- dates
  collection_datetime             TIMESTAMPTZ,
  collection_datetime_confidence  confidence_level DEFAULT 'missing',
  delivery_datetime               TIMESTAMPTZ,
  delivery_datetime_confidence    confidence_level DEFAULT 'missing',

  -- cargo details
  is_hazardous                    BOOLEAN,
  is_hazardous_confidence         confidence_level DEFAULT 'missing',
  weight                          TEXT,
  weight_confidence               confidence_level DEFAULT 'missing',
  dimensions                      TEXT,
  dimensions_confidence           confidence_level DEFAULT 'missing',
  quantity                        INTEGER,
  quantity_confidence             confidence_level DEFAULT 'missing',
  vehicle                         vehicle_type,
  vehicle_confidence              confidence_level DEFAULT 'missing',

  -- pricing
  pricing_category                TEXT,
  estimated_cost                  DECIMAL(10,2),

  -- assignments
  assigned_to                     UUID REFERENCES profiles(id),
  confirmed_by                    UUID REFERENCES profiles(id),

  created_at                      TIMESTAMPTZ DEFAULT now(),
  updated_at                      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE requests IS 'Booking/delivery requests extracted from inbound emails';
COMMENT ON COLUMN requests.docket_number IS '7-8 digit number, nullable until outbound reply';
COMMENT ON COLUMN requests.customer_ref_number IS 'Sometimes in inbound, always in outbound';
COMMENT ON COLUMN requests.account_code IS 'Rare in inbound, always in outbound';

-- ----------------------------------------------------------------------------
-- email_templates - reusable reply templates with placeholders
-- ----------------------------------------------------------------------------
CREATE TABLE email_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  description       TEXT,
  subject_template  TEXT NOT NULL,
  body_template     TEXT NOT NULL,
  created_by        UUID REFERENCES profiles(id),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  created_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE email_templates IS 'Reusable email templates with {{placeholder}} variables';

-- ----------------------------------------------------------------------------
-- pricing_rules - vehicle-based pricing with hazardous surcharges
-- ----------------------------------------------------------------------------
CREATE TABLE pricing_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type  vehicle_type NOT NULL,
  is_hazardous  BOOLEAN DEFAULT false,
  base_price    DECIMAL(10,2) NOT NULL,
  price_per_kg  DECIMAL(10,4),
  description   TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE(vehicle_type, is_hazardous)
);

COMMENT ON TABLE pricing_rules IS 'Pricing rules per vehicle type with hazardous material surcharges';

-- ----------------------------------------------------------------------------
-- audit_log - tracks all user actions for compliance
-- ----------------------------------------------------------------------------
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE audit_log IS 'Immutable audit trail for all user actions';
COMMENT ON COLUMN audit_log.action IS 'e.g. request.created, request.status_changed, email.classified';
COMMENT ON COLUMN audit_log.entity_type IS 'e.g. request, email, template, user, pricing';
COMMENT ON COLUMN audit_log.details IS 'JSONB with old_value and new_value for change tracking';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- emails indexes
CREATE INDEX idx_emails_graph_message_id ON emails(graph_message_id);
CREATE INDEX idx_emails_thread_id ON emails(thread_id);
CREATE INDEX idx_emails_direction ON emails(direction);
CREATE INDEX idx_emails_classification ON emails(classification);
CREATE INDEX idx_emails_received_at ON emails(received_at);

-- requests indexes
CREATE INDEX idx_requests_docket_number ON requests(docket_number);
CREATE INDEX idx_requests_customer_ref_number ON requests(customer_ref_number);
CREATE INDEX idx_requests_account_code ON requests(account_code);
CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_requests_assigned_to ON requests(assigned_to);

-- audit_log indexes
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity_type ON audit_log(entity_type);
CREATE INDEX idx_audit_log_entity_id ON audit_log(entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- attachments indexes
CREATE INDEX idx_attachments_email_id ON attachments(email_id);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to tables that have an updated_at column
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_pricing_rules_updated_at
  BEFORE UPDATE ON pricing_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- profiles RLS policies
-- ----------------------------------------------------------------------------

-- SELECT: all authenticated users can see all profiles
CREATE POLICY profiles_select_policy ON profiles
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: admins only
CREATE POLICY profiles_insert_policy ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- UPDATE: admins only
CREATE POLICY profiles_update_policy ON profiles
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: admins only
CREATE POLICY profiles_delete_policy ON profiles
  FOR DELETE TO authenticated
  USING (is_admin());

-- ----------------------------------------------------------------------------
-- emails RLS policies
-- ----------------------------------------------------------------------------

-- SELECT: all authenticated users
CREATE POLICY emails_select_policy ON emails
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: service role only (ingestion pipeline)
-- No authenticated insert policy - service_role bypasses RLS by default

-- UPDATE: all authenticated users (for classification changes)
CREATE POLICY emails_update_policy ON emails
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- attachments RLS policies
-- ----------------------------------------------------------------------------

-- SELECT: all authenticated users
CREATE POLICY attachments_select_policy ON attachments
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: service role only (ingestion pipeline)
-- No authenticated insert policy - service_role bypasses RLS by default

-- ----------------------------------------------------------------------------
-- requests RLS policies
-- ----------------------------------------------------------------------------

-- SELECT: admins see all, members see assigned_to = self OR unassigned drafts
CREATE POLICY requests_select_policy ON requests
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR assigned_to = auth.uid()
    OR (assigned_to IS NULL AND status = 'draft')
  );

-- INSERT: all authenticated users
CREATE POLICY requests_insert_policy ON requests
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: all authenticated users (audit log tracks who changed what)
CREATE POLICY requests_update_policy ON requests
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- email_templates RLS policies
-- ----------------------------------------------------------------------------

-- SELECT: all authenticated users
CREATE POLICY email_templates_select_policy ON email_templates
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: admins only
CREATE POLICY email_templates_insert_policy ON email_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- UPDATE: admins only
CREATE POLICY email_templates_update_policy ON email_templates
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: admins only
CREATE POLICY email_templates_delete_policy ON email_templates
  FOR DELETE TO authenticated
  USING (is_admin());

-- ----------------------------------------------------------------------------
-- pricing_rules RLS policies
-- ----------------------------------------------------------------------------

-- SELECT: admins only
CREATE POLICY pricing_rules_select_policy ON pricing_rules
  FOR SELECT TO authenticated
  USING (is_admin());

-- INSERT: admins only
CREATE POLICY pricing_rules_insert_policy ON pricing_rules
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- UPDATE: admins only
CREATE POLICY pricing_rules_update_policy ON pricing_rules
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: admins only
CREATE POLICY pricing_rules_delete_policy ON pricing_rules
  FOR DELETE TO authenticated
  USING (is_admin());

-- ----------------------------------------------------------------------------
-- audit_log RLS policies
-- ----------------------------------------------------------------------------

-- SELECT: admins see all, members see only their own actions
CREATE POLICY audit_log_select_policy ON audit_log
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR user_id = auth.uid()
  );

-- INSERT: all authenticated users (for logging actions)
CREATE POLICY audit_log_insert_policy ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Email templates
-- ----------------------------------------------------------------------------

INSERT INTO email_templates (name, description, subject_template, body_template) VALUES
(
  'standard_confirmation',
  'Standard booking confirmation sent after processing a request',
  'Booking Confirmation - Docket {{docket_number}}',
  E'Dear Customer,\n\nWe are pleased to confirm your booking with the following details:\n\nDocket Number: {{docket_number}}\nCustomer Reference: {{customer_ref}}\nAccount Code: {{account_code}}\n\nCollection: {{collection_address}}\nCollection Date: {{collection_date}}\n\nDelivery: {{delivery_address}}\nDelivery Date: {{delivery_date}}\n\nVehicle Type: {{vehicle_type}}\nWeight: {{weight}}\n\nPlease do not hesitate to contact us if you have any questions.\n\nKind regards,\nLinkworks Operations Team'
),
(
  'early_closure',
  'Notification sent when a booking is closed earlier than the original delivery date',
  'Early Closure Notice - Docket {{docket_number}}',
  E'Dear Customer,\n\nPlease be advised that your booking (Docket: {{docket_number}}, Ref: {{customer_ref}}) has been processed for early closure.\n\nOriginal Delivery Date: {{delivery_date}}\nUpdated Status: Closed Early\n\nIf you have any concerns, please contact us immediately.\n\nKind regards,\nLinkworks Operations Team'
),
(
  'oog_confirmation',
  'Confirmation for Out of Gauge (OOG) bookings requiring special handling',
  'Out of Gauge Booking Confirmation - Docket {{docket_number}}',
  E'Dear Customer,\n\nWe confirm your Out of Gauge (OOG) booking:\n\nDocket Number: {{docket_number}}\nCustomer Reference: {{customer_ref}}\nAccount Code: {{account_code}}\n\nCollection: {{collection_address}}\nDelivery: {{delivery_address}}\n\nDimensions: {{dimensions}}\nWeight: {{weight}}\nVehicle Type: {{vehicle_type}}\n\nPlease note that OOG shipments may require additional handling time and charges.\n\nKind regards,\nLinkworks Operations Team'
);

-- ----------------------------------------------------------------------------
-- Pricing rules (sample data)
-- ----------------------------------------------------------------------------

INSERT INTO pricing_rules (vehicle_type, is_hazardous, base_price, price_per_kg, description) VALUES
('standard',     false, 150.00, 0.50,  'Standard vehicle - non-hazardous cargo'),
('standard',     true,  250.00, 0.85,  'Standard vehicle - hazardous cargo'),
('tailift',      false, 200.00, 0.60,  'Tailift vehicle - non-hazardous cargo'),
('tailift',      true,  320.00, 0.95,  'Tailift vehicle - hazardous cargo'),
('oog',          false, 350.00, 0.75,  'Out of Gauge vehicle - non-hazardous cargo'),
('oog',          true,  500.00, 1.10,  'Out of Gauge vehicle - hazardous cargo'),
('curtain_side', false, 180.00, 0.55,  'Curtain side vehicle - non-hazardous cargo'),
('curtain_side', true,  280.00, 0.90,  'Curtain side vehicle - hazardous cargo');
