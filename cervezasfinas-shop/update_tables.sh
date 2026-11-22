#!/bin/bash
# Script para actualizar todos los nombres de tablas sin prefijo shop_

cd "c:/Users/Usuario/OneDrive/Documentos/CERVEZASFINAS/cervezasfinas-shop/api"

echo "Actualizando archivos PHP..."

# Lista de reemplazos  
find . -name "*.php" -type f -exec sed -i 's/\bFROM products\b/FROM shop_products/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bJOIN products\b/JOIN shop_products/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM orders\b/FROM shop_orders/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bINTO orders\b/INTO shop_orders/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bUPDATE orders\b/UPDATE shop_orders/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM order_items\b/FROM shop_order_items/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bINTO order_items\b/INTO shop_order_items/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM client_points\b/FROM shop_client_points/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bINTO client_points\b/INTO shop_client_points/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bUPDATE client_points\b/UPDATE shop_client_points/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM points_transactions\b/FROM shop_points_transactions/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bINTO points_transactions\b/INTO shop_points_transactions/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM points_config\b/FROM shop_points_config/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM cooler_executions\b/FROM shop_cooler_executions/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bINTO cooler_executions\b/INTO shop_cooler_executions/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bUPDATE cooler_executions\b/UPDATE shop_cooler_executions/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM cooler_reference_photos\b/FROM shop_cooler_reference_photos/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM point_redemption_products\b/FROM shop_point_redemption_products/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM point_redemptions\b/FROM shop_point_redemptions/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bINTO point_redemptions\b/INTO shop_point_redemptions/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bUPDATE point_redemptions\b/UPDATE shop_point_redemptions/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM special_prices\b/FROM shop_special_prices/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM promotions\b/FROM shop_promotions/g' {} \;
find . -name "*.php" -type f -exec sed -i 's/\bFROM gec_discounts\b/FROM shop_gec_discounts/g' {} \;

echo "✅ Actualización completada!"
echo "Total de archivos procesados:"
find . -name "*.php" -type f | wc -l
