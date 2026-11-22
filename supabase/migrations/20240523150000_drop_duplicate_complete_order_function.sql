-- This migration removes the duplicate complete_installation_order function
-- that incorrectly used a BIGINT as the parameter type. This resolves
-- the function overloading ambiguity.

DROP FUNCTION IF EXISTS public.complete_installation_order(bigint);
