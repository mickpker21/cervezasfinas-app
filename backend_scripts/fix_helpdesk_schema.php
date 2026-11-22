<?php
header("Content-Type: text/plain; charset=UTF-8");
include_once 'db_config.php';

try {
    $pdo = getDBConnection();
    
    echo "--- INICIANDO REPARACIÓN DE ESQUEMA HELPDESK ---\n\n";

    // 1. Asegurar que las tablas existen
    echo "Verificando/Creando tablas base...\n";
    $migration_sql = file_get_contents('migration_helpdesk.sql');
    $pdo->exec($migration_sql);
    echo "Tablas base verificadas.\n\n";

    // 2. Agregar columna image_url a support_tickets si falta
    echo "Verificando columna 'image_url' en support_tickets...\n";
    $stmt = $pdo->query("SHOW COLUMNS FROM support_tickets LIKE 'image_url'");
    if (!$stmt->fetch()) {
        echo "Añadiendo columna 'image_url' a support_tickets...\n";
        $pdo->exec("ALTER TABLE support_tickets ADD COLUMN image_url LONGTEXT AFTER assigned_to");
        echo "✅ Columna añadida con éxito.\n";
    } else {
        echo "ℹ️ La columna 'image_url' ya existe en support_tickets.\n";
    }

    // 3. Agregar columna image_url a support_ticket_messages si falta
    echo "\nVerificando columna 'image_url' en support_ticket_messages...\n";
    $stmt = $pdo->query("SHOW COLUMNS FROM support_ticket_messages LIKE 'image_url'");
    if (!$stmt->fetch()) {
        echo "Añadiendo columna 'image_url' a support_ticket_messages...\n";
        $pdo->exec("ALTER TABLE support_ticket_messages ADD COLUMN image_url LONGTEXT AFTER message");
        echo "✅ Columna añadida con éxito.\n";
    } else {
        echo "ℹ️ La columna 'image_url' ya existe en support_ticket_messages.\n";
    }

    echo "\n--- REPARACIÓN COMPLETADA ---";

} catch (Exception $e) {
    echo "\n❌ ERROR CRÍTICO: " . $e->getMessage() . "\n";
}
?>
