-- Add is_priority flag to requests table
-- Allows marking emails/requests as high priority throughout the flow

ALTER TABLE requests ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT false;

-- Add weight_unit and dimensions_unit columns for unit tracking
ALTER TABLE requests ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'kg';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS dimensions_unit TEXT DEFAULT 'cm';
