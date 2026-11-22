@echo off
REM Script para actualizar nombres de tablas en APIs PHP

cd /d "c:\Users\Usuario\OneDrive\Documentos\CERVEZASFINAS\cervezasfinas-shop\api"

echo Actualizando archivos PHP...

REM Auth
powershell -Command "(gc auth\login.php) -replace 'client_users(?! )','shop_client_users' | sc auth\login.php"
powershell -Command "(gc auth\change-password.php) -replace 'client_users(?! )','shop_client_users' | sc auth\change-password.php"

REM Products  
powershell -Command "$c=gc products\list.php -Raw; $c -replace '(?<!shop_)products(?! )','shop_products' | sc products\list.php -NoNewline"
powershell -Command "$c=gc products\calculate-price.php -Raw; $c -replace '(?<!shop_)products(?! )','shop_products' -replace '(?<!shop_)special_prices(?! )','shop_special_prices' -replace '(?<!shop_)promotions(?! )','shop_promotions' -replace '(?<!shop_)gec_discounts(?! )','shop_gec_discounts' | sc products\calculate-price.php -NoNewline"

REM Orders
powershell -Command "$c=gc orders\create.php -Raw; $c -replace '(?<!shop_)orders(?! )','shop_orders' -replace '(?<!shop_)order_items(?! )','shop_order_items' | sc orders\create.php -NoNewline"
powershell -Command "$c=gc orders\list.php -Raw; $c -replace '(?<!shop_)orders(?! )','shop_orders' -replace '(?<!shop_)order_items(?! )','shop_order_items' -replace '(?<!shop_)products(?! )','shop_products' | sc orders\list.php -NoNewline"

REM Points
powershell -Command "$c=gc points\balance.php -Raw; $c -replace '(?<!shop_)client_points(?! )','shop_client_points' -replace '(?<!shop_)points_transactions(?! )','shop_points_transactions' | sc points\balance.php -NoNewline"
powershell -Command "$c=gc points\transactions.php -Raw; $c -replace '(?<!shop_)points_transactions(?! )','shop_points_transactions' -replace '(?<!shop_)orders(?! )','shop_orders' | sc points\transactions.php -NoNewline"
powershell -Command "$c=gc points\redemption-products.php -Raw; $c -replace '(?<!shop_)point_redemption_products(?! )','shop_point_redemption_products' -replace '(?<!shop_)products(?! )','shop_products' | sc points\redemption-products.php -NoNewline"
powershell -Command "$c=gc points\redeem.php -Raw; $c -replace '(?<!shop_)point_redemption_products(?! )','shop_point_redemption_products' -replace '(?<!shop_)client_points(?! )','shop_client_points' -replace '(?<!shop_)points_transactions(?! )','shop_points_transactions' -replace '(?<!shop_)point_redemptions(?! )','shop_point_redemptions' | sc points\redeem.php -NoNewline"

REM Cooler
powershell -Command "$c=gc cooler\reference-photos.php -Raw; $c -replace '(?<!shop_)cooler_reference_photos(?! )','shop_cooler_reference_photos' | sc cooler\reference-photos.php -NoNewline"
powershell -Command "$c=gc cooler\submit.php -Raw; $c -replace '(?<!shop_)cooler_executions(?! )','shop_cooler_executions' | sc cooler\submit.php -NoNewline"

REM Televenta
powershell -Command "$c=gc televenta\orders-list.php -Raw; $c -replace '(?<!shop_)orders(?! )','shop_orders' -replace '(?<!shop_)order_items(?! )','shop_order_items' -replace '(?<!shop_)products(?! )','shop_products' | sc televenta\orders-list.php -NoNewline"
powershell -Command "$c=gc televenta\confirm-order.php -Raw; $c -replace '(?<!shop_)orders(?! )','shop_orders' | sc televenta\confirm-order.php -NoNewline"
powershell -Command "$c=gc televenta\deliver-order.php -Raw; $c -replace '(?<!shop_)orders(?! )','shop_orders' -replace '(?<!shop_)points_config(?! )','shop_points_config' -replace '(?<!shop_)points_transactions(?! )','shop_points_transactions' -replace '(?<!shop_)client_points(?! )','shop_client_points' | sc televenta\deliver-order.php -NoNewline"
powershell -Command "$c=gc televenta\executions-list.php -Raw; $c -replace '(?<!shop_)cooler_executions(?! )','shop_cooler_executions' | sc televenta\executions-list.php -NoNewline"
powershell -Command "$c=gc televenta\approve-execution.php -Raw; $c -replace '(?<!shop_)cooler_executions(?! )','shop_cooler_executions' -replace '(?<!shop_)points_transactions(?! )','shop_points_transactions' -replace '(?<!shop_)client_points(?! )','shop_client_points' | sc televenta\approve-execution.php -NoNewline"
powershell -Command "$c=gc televenta\reject-execution.php -Raw; $c -replace '(?<!shop_)cooler_executions(?! )','shop_cooler_executions' | sc televenta\reject-execution.php -NoNewline"
powershell -Command "$c=gc televenta\redemptions-list.php -Raw; $c -replace '(?<!shop_)point_redemptions(?! )','shop_point_redemptions' -replace '(?<!shop_)point_redemption_products(?! )','shop_point_redemption_products' -replace '(?<!shop_)products(?! )','shop_products' | sc televenta\redemptions-list.php -NoNewline"
powershell -Command "$c=gc televenta\approve-redemption.php -Raw; $c -replace '(?<!shop_)point_redemptions(?! )','shop_point_redemptions' | sc televenta\approve-redemption.php -NoNewline"

echo.
echo ========================================
echo Actualizacion completada!
echo ========================================
pause
