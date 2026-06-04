# YCE Employee Portal — Live Sync Version

This is the Supabase + Vercel version.

## What this version does
- Employee login by full name + password
- Admin login for Bassam Francis and Sharbel Francis
- Shared live database using Supabase
- Employee hours sync to admin
- Availability syncs to admin
- Admin can approve/deny hours
- Admin can add/edit/remove employees
- Admin can set hourly rate
- Employee earnings update by selected month/year

## Setup
1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Paste and run `supabase-schema.sql`.
4. Go to Project Settings → API.
5. Copy Project URL and anon public key.
6. Create `.env` from `.env.example`.
7. Run:
   npm install
   npm run dev

## Deploy to Vercel
1. Upload this folder to GitHub.
2. Import the repo into Vercel.
3. Add environment variables:
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
4. Deploy.

## Default logins after SQL seed
Admin:
- Bassam Francis / yce.corp73
- Sharbel Francis / yce.corp73

Employees:
- John Smith / 1234
- Michael D. / 1234

Important: This is simple demo password logic for a private prototype. For production, use Supabase Auth.
