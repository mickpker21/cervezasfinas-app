-- HEAVY REPAIR SCRIPT FOR SUPERVISOR WORK PLAN
-- Run this in Supabase SQL Editor to fix missing columns and permission errors.

-- 1. Ensure columns exist (Fix for PGRST204)
ALTER TABLE supervisor_work_plan_activities 
ADD COLUMN IF NOT EXISTS duration TEXT,
ADD COLUMN IF NOT EXISTS target TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Ensure RLS is enabled
ALTER TABLE supervisor_work_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_work_plan_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_work_plan_records ENABLE ROW LEVEL SECURITY;

-- 3. Simplified & Robust Policies for SUPERVISORS (Fix for 403)

-- MASTER PLANS
DROP POLICY IF EXISTS "Supervisors can manage their master plans" ON supervisor_work_plans;
CREATE POLICY "Supervisors can manage their master plans" ON supervisor_work_plans
    FOR ALL USING (auth.uid() = supervisor_id)
    WITH CHECK (auth.uid() = supervisor_id);

-- ACTIVITIES
DROP POLICY IF EXISTS "Supervisors can manage their activities" ON supervisor_work_plan_activities;
CREATE POLICY "Supervisors can manage their activities" ON supervisor_work_plan_activities
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM supervisor_work_plans p
            WHERE p.id = plan_id AND p.supervisor_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM supervisor_work_plans p
            WHERE p.id = plan_id AND p.supervisor_id = auth.uid()
        )
    );

-- RECORDS (Optimized query to avoid recursion or complex joins)
DROP POLICY IF EXISTS "Supervisors can manage their records" ON supervisor_work_plan_records;
CREATE POLICY "Supervisors can manage their records" ON supervisor_work_plan_records
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM supervisor_work_plan_activities a
            JOIN supervisor_work_plans p ON p.id = a.plan_id
            WHERE a.id = activity_id AND p.supervisor_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM supervisor_work_plan_activities a
            JOIN supervisor_work_plans p ON p.id = a.plan_id
            WHERE a.id = activity_id AND p.supervisor_id = auth.uid()
        )
    );

-- 4. Policies for ADMINS / HR (Full Management)
DROP POLICY IF EXISTS "Admins/HR can view all plans" ON supervisor_work_plans;
DROP POLICY IF EXISTS "Admins/HR can manage all plans" ON supervisor_work_plans;
CREATE POLICY "Admins/HR can manage all plans" ON supervisor_work_plans
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role ~* '(admin|administrador|rh)'
        )
    );

DROP POLICY IF EXISTS "Admins/HR can view all activities" ON supervisor_work_plan_activities;
DROP POLICY IF EXISTS "Admins/HR can manage all activities" ON supervisor_work_plan_activities;
CREATE POLICY "Admins/HR can manage all activities" ON supervisor_work_plan_activities
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role ~* '(admin|administrador|rh)'
        )
    );

DROP POLICY IF EXISTS "Admins/HR can view all records" ON supervisor_work_plan_records;
DROP POLICY IF EXISTS "Admins/HR can manage all records" ON supervisor_work_plan_records;
CREATE POLICY "Admins/HR can manage all records" ON supervisor_work_plan_records
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role ~* '(admin|administrador|rh)'
        )
    );
