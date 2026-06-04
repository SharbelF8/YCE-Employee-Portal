
-- YCE Employee Portal Supabase Schema

create extension if not exists "pgcrypto";

drop table if exists availability;
drop table if exists hours;
drop table if exists employees;

create table employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique,
  password text not null,
  role text default '',
  email text default '',
  phone text default '',
  hourly_rate numeric(10,2) default 0,
  is_admin boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

create table hours (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  total_hours numeric(10,2) not null,
  notes text default '',
  status text default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now()
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  available_date date not null,
  notes text default '',
  created_at timestamptz default now(),
  unique(employee_id, available_date)
);

-- Enable Row Level Security.
alter table employees enable row level security;
alter table hours enable row level security;
alter table availability enable row level security;

-- Prototype policies: allow anon app reads/writes.
-- For production, replace with Supabase Auth policies.
create policy "prototype employees all" on employees for all using (true) with check (true);
create policy "prototype hours all" on hours for all using (true) with check (true);
create policy "prototype availability all" on availability for all using (true) with check (true);

insert into employees (full_name, password, role, email, phone, hourly_rate, is_admin, active) values
('Bassam Francis', 'yce.corp73', 'Admin', 'bassam777@hotmail.com', '519-817-4458', 0, true, true),
('Sharbel Francis', 'yce.corp73', 'Admin', 'sharbelf08@gmail.com', '', 0, true, true),
('John Smith', '1234', 'Floor Installer', 'john@yce.com', '', 25, false, true),
('Michael D.', '1234', 'Helper', 'michael@yce.com', '', 20, false, true);
