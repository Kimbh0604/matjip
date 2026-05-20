alter table "defaultMatjip"
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7);

create index if not exists default_matjip_coordinates_idx
  on "defaultMatjip" (latitude, longitude);
