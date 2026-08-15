alter table public.household_wallpapers
  add column position_x double precision not null default 50,
  add column position_y double precision not null default 50,
  add column zoom double precision not null default 1,
  add constraint household_wallpapers_position_x_check check (position_x between 0 and 100),
  add constraint household_wallpapers_position_y_check check (position_y between 0 and 100),
  add constraint household_wallpapers_zoom_check check (zoom between 1 and 3);
