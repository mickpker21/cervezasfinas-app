<?php
header("Content-Type: text/plain; charset=UTF-8");
require_once __DIR__ . '/db_config.php';

echo "Iniciando actualización de la base de datos...\n\n";

try {
    $pdo = getDBConnection();
    
    // Add columns to assets table
    $queries = [
        "ALTER TABLE assets ADD COLUMN brand VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE assets ADD COLUMN model VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE assets ADD COLUMN qr_value VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE assets ADD COLUMN warehouse_id VARCHAR(50) DEFAULT NULL"
    ];
    
    foreach ($queries as $q) {
        try {
            $pdo->exec($q);
            echo "EXITO: $q\n";
        } catch (Exception $e) {
            echo "OMITIDO (Probablemente ya existe): " . $e->getMessage() . "\n";
        }
    }
    
    echo "\nActualización completada correctamente. Ya puedes cerrar esta ventana.\n";
} catch (Exception $e) {
    echo "\nERROR: " . $e->getMessage();
}
?>
