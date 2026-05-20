create table if not exists "defaultMatjip" (
  id bigserial primary key,
  name varchar(120) not null,
  food_category varchar(50) not null,
  address varchar(255) not null,
  operating_hours text,
  phone_number varchar(30),
  catch_table_reservable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint default_matjip_name_address_unique unique (name, address)
);

create index if not exists default_matjip_food_category_idx
  on "defaultMatjip" (food_category);

create index if not exists default_matjip_address_idx
  on "defaultMatjip" (address);
