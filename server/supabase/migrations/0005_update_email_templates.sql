-- Update email templates with correct placeholder names and better structure.
-- The template engine now wraps these in HTML automatically, so keep
-- the body as clean structured text with "Label: Value" lines.

UPDATE email_templates
SET body_template = E'Dear Customer,\n\nWe are pleased to confirm your booking with the following details:\n\nDocket Number: {{docket_number}}\nCustomer Reference: {{customer_ref}}\nAccount Code: {{account_code}}\n\nCollection Address: {{collection_address}}\nCollection Date: {{collection_date}}\n\nDelivery Address: {{delivery_address}}\nDelivery Date: {{delivery_date}}\n\nVehicle Type: {{vehicle_type}}\nHazardous: {{hazardous}}\nWeight: {{weight}}\n\nPlease do not hesitate to contact us if you have any questions.\n\nKind regards,\nLinkworks Operations Team',
    updated_at = now()
WHERE name = 'standard_confirmation';

UPDATE email_templates
SET body_template = E'Dear Customer,\n\nPlease be advised that your booking has been processed for early closure.\n\nDocket Number: {{docket_number}}\nCustomer Reference: {{customer_ref}}\n\nOriginal Delivery Date: {{delivery_date}}\nUpdated Status: Closed Early\n\nIf you have any concerns, please contact us immediately.\n\nKind regards,\nLinkworks Operations Team',
    updated_at = now()
WHERE name = 'early_closure';

UPDATE email_templates
SET body_template = E'Dear Customer,\n\nWe confirm your Out of Gauge (OOG) booking:\n\nDocket Number: {{docket_number}}\nCustomer Reference: {{customer_ref}}\nAccount Code: {{account_code}}\n\nCollection Address: {{collection_address}}\nCollection Date: {{collection_date}}\n\nDelivery Address: {{delivery_address}}\nDelivery Date: {{delivery_date}}\n\nDimensions: {{dimensions}}\nWeight: {{weight}}\nVehicle Type: {{vehicle_type}}\nHazardous: {{hazardous}}\n\nPlease note that OOG shipments may require additional handling time and charges.\n\nKind regards,\nLinkworks Operations Team',
    updated_at = now()
WHERE name = 'oog_confirmation';
