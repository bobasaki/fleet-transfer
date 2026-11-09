-- Odometer start reading (taken at beginning of trip)
alter table transfers add column odometer_km_start integer;

-- Route: where the car was picked up and where it was left
alter table transfers add column route_from text;
alter table transfers add column route_to   text;
