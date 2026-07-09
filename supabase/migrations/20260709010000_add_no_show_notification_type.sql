-- Step 1 of 2 for the new "mark as no-show" feature (guides + rental staff
-- reporting a customer who didn't show up for their booking).
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction as a
-- statement that references the new value (Postgres restriction) -- this
-- codebase already follows the split-migration convention for that reason
-- (see how 'rental_staff' was added to app_role in one migration and only
-- referenced starting with the next one). This migration only adds the
-- enum value; the function that uses it lives in the next migration file.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'no_show';
