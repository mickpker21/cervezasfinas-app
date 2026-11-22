-- 1. Remove duplicates keeping the latest one (optional, use with caution if you have real duplicates)
-- This is a complex operation in MySQL. Simplified approach:

-- 2. Ensure ID is Primary Key (This will fail if you have duplicates, you must clean them first)
ALTER TABLE visitas
ADD PRIMARY KEY (id);

-- If this fails because "Multiple primary key defined", you are safe.
-- If this fails because "Duplicate entry", you MUST delete duplicates first.

-- Helper query to find duplicates:
-- SELECT id, COUNT(*) as c FROM visitas GROUP BY id HAVING c > 1;

-- Helper query to delete duplicates (Keep latest):
-- DELETE t1 FROM visitas t1
-- INNER JOIN visitas t2 
-- WHERE t1.id = t2.id AND t1.created_at < t2.created_at;

-- AFTER cleaning, run:
-- ALTER TABLE visitas ADD PRIMARY KEY (id);
