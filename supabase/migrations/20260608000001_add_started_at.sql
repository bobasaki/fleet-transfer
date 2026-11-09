-- Track when the driver opened the form and started filling it out.
-- Null for transfers submitted before this column was added.
alter table transfers add column if not exists started_at timestamptz;
