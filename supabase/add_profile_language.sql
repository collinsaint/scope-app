-- Add language preference to profiles
-- Run this in the Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es'));
