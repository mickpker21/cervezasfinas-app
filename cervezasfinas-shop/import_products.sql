-- ============================================
-- SCRIPT PARA IMPORTAR PRODUCTOS EXISTENTES
-- ============================================

-- PASO 1: Importar productos desde tu tabla actual
-- Ajusta el nombre de tu tabla actual si es diferente

INSERT INTO products (sku, name, description, base_price, category, image_url, is_active)
SELECT 
    sku,
    nombre AS name,
    descripcion AS description,
    precio AS base_price,
    categoria AS category,
    image_url,  -- Si ya tienes este campo
    1 AS is_active
FROM tu_tabla_productos_actual
WHERE activo = 1;  -- Solo productos activos

-- ============================================
-- ALTERNATIVA: Si necesitas mapear campos diferentes
-- ============================================

-- Ejemplo si tu tabla tiene nombres diferentes:
INSERT INTO products (sku, name, description, base_price, category, image_url, is_active)
SELECT 
    codigo_producto AS sku,
    nombre_producto AS name,
    COALESCE(descripcion, nombre_producto) AS description,
    precio_base AS base_price,
    'Cerveza' AS category,  -- O mapear desde tu campo
    CONCAT('https://cervezasfinas.com/images/skus/', LOWER(codigo_producto), '.jpg') AS image_url,
    1 AS is_active
FROM productos_existentes
WHERE estado = 'activo';

-- ============================================
-- OPCIÓN SIMPLE: Productos de ejemplo
-- ============================================

-- Si quieres empezar desde cero, usa estos ejemplos:
INSERT INTO products (sku, name, description, base_price, category, image_url, is_active) VALUES
('CORONA355', 'Corona Extra 355ml', 'Cerveza clara importada de México', 15.50, 'Cerveza', NULL, 1),
('VICTORIA355', 'Victoria 355ml', 'Cerveza tipo Viena mexicana', 14.00, 'Cerveza', NULL, 1),
('MODELO355', 'Modelo Especial 355ml', 'Cerveza clara tipo Pilsner', 14.50, 'Cerveza', NULL, 1),
('PACIFI355', 'Pacífico Clara 355ml', 'Cerveza clara estilo Pilsner', 14.00, 'Cerveza', NULL, 1),
('NEGMOD355', 'Negra Modelo 355ml', 'Cerveza oscura tipo Munich', 15.00, 'Cerveza', NULL, 1),
('CORONA710', 'Corona Extra 710ml', 'Cerveza clara importada familiar', 28.00, 'Cerveza', NULL, 1),
('VICTORIA710', 'Victoria 710ml', 'Cerveza tipo Viena familiar', 26.00, 'Cerveza', NULL, 1);

-- ============================================
-- ACTUALIZAR IMÁGENES DESPUÉS (si tienes URLs)
-- ============================================

-- Opción A: Actualizar una por una
UPDATE products SET image_url = 'https://cervezasfinas.com/images/skus/corona355.jpg' WHERE sku = 'CORONA355';
UPDATE products SET image_url = 'https://cervezasfinas.com/images/skus/victoria355.jpg' WHERE sku = 'VICTORIA355';

-- Opción B: Actualizar en batch con patrón
UPDATE products 
SET image_url = CONCAT('https://cervezasfinas.com/images/skus/', LOWER(sku), '.jpg')
WHERE image_url IS NULL;

-- ============================================
-- VERIFICAR PRODUCTOS INSERTADOS
-- ============================================

SELECT COUNT(*) AS total_productos FROM products WHERE is_active = 1;
SELECT sku, name, base_price, image_url FROM products ORDER BY created_at DESC LIMIT 10;

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================

/*
1. IMÁGENES:
   - El campo image_url acepta NULL (se mostrará icono placeholder)
   - Puedes agregar URLs después
   - Formato recomendado: JPEG/PNG de ~500x500px

2. CATEGORÍAS:
   - Usa categorías consistentes: 'Cerveza', 'Refresco', 'Agua', etc.
   - Se usan para filtros en el catálogo

3. PRECIOS:
   - base_price es el precio base
   - El sistema calculará automáticamente:
     * Promociones activas
     * Descuentos GEC
     * Precios especiales por cliente

4. SKU:
   - Debe ser único
   - Recomendado: código corto y fácil de recordar
   - Ejemplo: CORONA355, VICTORIA710
*/
