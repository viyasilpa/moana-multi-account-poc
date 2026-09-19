alter table public.poc_items add column note text not null default '' check (length(note) <= 500);
