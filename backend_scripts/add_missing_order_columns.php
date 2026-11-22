<?php
header("Content-Type: text/plain; charset=UTF-8");
include_once 'db_config.php';

try {
    $pdo = getDBConnection();
    
    echo "--- INICIANDO REPARACIÓN DE COLUMNAS DE PEDIDOS ---\n";

    $columnsToAdd = [
        "client_name_cached VARCHAR(255) DEFAULT NULL",
        "client_address_cached TEXT DEFAULT NULL",
        "client_business_name_cached VARCHAR(255) DEFAULT NULL",
        "destination_client_name_cached VARCHAR(255) DEFAULT NULL",
        "destination_client_address_cached TEXT DEFAULT NULL",
        "destination_client_business_name_cached VARCHAR(255) DEFAULT NULL"
    ];

    foreach ($columnsToAdd as $columnDef) {
        $colName = explode(" ", $columnDef)[0];
        echo "Verificando/Agregando: $colName... ";
        
        try {
            // Intentar agregar la columna
            $pdo->exec("ALTER TABLE installation_orders ADD COLUMN $columnDef");
            echo "AGREGADA.\n";
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), 'Duplicate column name') !== false) {
                echo "YA EXISTE.\n";
            } else {
                echo "ERROR: " . $e->getMessage() . "\n";
            }
        }
    }

    echo "\n--- REPARACIÓN COMPLETADA ---\n";

} catch (Exception $e) {
    echo "ERROR CRÍTICO: " . $e->getMessage() . "\n";
}
?>
