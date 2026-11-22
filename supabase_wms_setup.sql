-- ==========================================
-- WMS MULTI-BODEGA Y TRASPASOS SCRIPT
-- ==========================================

-- LIMPIEZA DE TABLAS FALLIDAS (Por si quedaron creadas con UUID en el intento anterior)
DROP TABLE IF EXISTS public.warehouse_transfer_items CASCADE;
DROP TABLE IF EXISTS public.warehouse_transfers CASCADE;
DROP TABLE IF EXISTS public.warehouse_transactions CASCADE;
DROP TABLE IF EXISTS public.warehouse_inventory CASCADE;

-- 1. Tabla de Productos (Catálogo Maestro en Supabase)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    is_returnable BOOLEAN DEFAULT FALSE,
    returnable_container_sku VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Inventario Físico por Bodega
CREATE TABLE IF NOT EXISTS public.warehouse_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id INTEGER REFERENCES public.branches(id) ON DELETE CASCADE,
    product_sku VARCHAR(100) REFERENCES public.products(sku) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(branch_id, product_sku)
);

-- 3. Kárdex / Historial de Transacciones Inmutable
CREATE TABLE IF NOT EXISTS public.warehouse_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id INTEGER REFERENCES public.branches(id) ON DELETE CASCADE,
    product_sku VARCHAR(100) REFERENCES public.products(sku) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- INGRESO_PROVEEDOR, EGRESO_VENTA, MERMA, TRASPASO_SALIDA, TRASPASO_ENTRADA, AJUSTE
    quantity INTEGER NOT NULL, -- Cantidad absoluta del movimiento
    reference_id VARCHAR(255), -- Folio, ID traspaso, etc.
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Traspasos (Cabecera)
CREATE TABLE IF NOT EXISTS public.warehouse_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    origin_branch_id INTEGER REFERENCES public.branches(id) ON DELETE CASCADE,
    destination_branch_id INTEGER REFERENCES public.branches(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, RECEIVED, REJECTED
    created_by UUID REFERENCES auth.users(id),
    received_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    received_at TIMESTAMP WITH TIME ZONE
);

-- 5. Traspasos (Partidas/Detalle)
CREATE TABLE IF NOT EXISTS public.warehouse_transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID REFERENCES public.warehouse_transfers(id) ON DELETE CASCADE,
    product_sku VARCHAR(100) REFERENCES public.products(sku) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    UNIQUE(transfer_id, product_sku)
);

-- SEGURIDAD (RLS) - Permite acceso a todos los usuarios autenticados por ahora para facilitar la transición
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo en products" ON public.products;
CREATE POLICY "Permitir todo en products" ON public.products FOR ALL USING (true);

ALTER TABLE public.warehouse_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo en warehouse_inventory" ON public.warehouse_inventory;
CREATE POLICY "Permitir todo en warehouse_inventory" ON public.warehouse_inventory FOR ALL USING (true);

ALTER TABLE public.warehouse_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo en warehouse_transactions" ON public.warehouse_transactions;
CREATE POLICY "Permitir todo en warehouse_transactions" ON public.warehouse_transactions FOR ALL USING (true);

ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo en warehouse_transfers" ON public.warehouse_transfers;
CREATE POLICY "Permitir todo en warehouse_transfers" ON public.warehouse_transfers FOR ALL USING (true);

ALTER TABLE public.warehouse_transfer_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo en warehouse_transfer_items" ON public.warehouse_transfer_items;
CREATE POLICY "Permitir todo en warehouse_transfer_items" ON public.warehouse_transfer_items FOR ALL USING (true);
