alter table "defaultMatjip"
  add column if not exists naver_category varchar(100),
  add column if not exists naver_place_id varchar(40),
  add column if not exists naver_link text,
  add column if not exists memo text,
  add column if not exists source varchar(120);

create unique index if not exists default_matjip_naver_place_id_unique
  on "defaultMatjip" (naver_place_id)
  where naver_place_id is not null and naver_place_id <> '';
