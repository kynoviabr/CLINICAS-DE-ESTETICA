-- Migration: Remove NPS module and Satisfaction page
-- Drop table nps_responses and remove permissions nps.view and satisfaction.view

-- Remove permissions from access_group_permissions
DELETE FROM public.access_group_permissions WHERE permission_key IN ('nps.view', 'satisfaction.view');

-- Drop the table (it will automatically drop policies and triggers attached to it)
DROP TABLE IF EXISTS public.nps_responses;
