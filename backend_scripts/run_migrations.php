<?php
/**
 * Script para ejecutar las migraciones pendientes (Tercerizados y Supervisión a Bordo)
 */
require_once 'db_config.php';

header('Content-Type: text/plain; charset=utf-8');

try {
    $pdo = getDBConnection();
    echo "--- INICIANDO MIGRACIONES ---\n\n";

    $migrations = [
        'create_table_tercerizados.sql',
        'migration_onboard_supervision.sql',
        'migration_helpdesk.sql'
    ];

    foreach ($migrations as $file) {
        echo "Procesando $file...\n";
        if (!file_exists($file)) {
            echo "❌ Error: El archivo $file no existe.\n\n";
            continue;
        }

        $sql = file_get_contents($file);
        
        // Ejecutar el SQL (usando exec para sentencias múltiples si es necesario, 
        // aunque PDO::exec es mejor para una sola cadena de comandos)
        try {
            $pdo->exec($sql);
            echo "✅ $file ejecutado con éxito.\n\n";
        } catch (PDOException $e) {
            echo "❌ Error en $file: " . $e->getMessage() . "\n\n";
        }
    }

    echo "--- MIGRACIONES FINALIZADAS ---";

} catch (Exception $e) {
    echo "ERROR CRÍTICO: " . $e->getMessage();
}
?>
