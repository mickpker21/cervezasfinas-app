<?php
// setup_clients_table.php
// Script para REINICIAR la tabla de clientes y AGREGAR el índice único necesario para que el upsert funcione.
// ATENCIÓN: ESTO BORRA TODOS LOS CLIENTES DE LA TABLA MYSQL.

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php';

try {
    $database = new Database();
    $db = $database->getConnection();

    // 1. Truncate table (Borrar datos para evitar error de duplicados al crear índice)
    echo "1. Borrando datos existentes (TRUNCATE)...\n";
    $sqlTruncate = "TRUNCATE TABLE clients";
    $db->exec($sqlTruncate);
    echo "   OK.\n";

    // 2. Conver to UTF8mb4 (Just in case)
    echo "2. Asegurando UTF8mb4...\n";
    $sqlCharset = "ALTER TABLE clients CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci";
    $db->exec($sqlCharset);
    echo "   OK.\n";

    // 3. Add UNIQUE Index on client_code (CRITICAL for upsert)
    echo "3. Creando índice ÚNICO en client_code...\n";
    // Check if index exists usually requires checking information_schema, but simpler to TRY matching.
    // Drop it if exists just to be sure valid structure
    try {
        $db->exec("DROP INDEX idx_unique_client_code ON clients");
        echo "   (Índice anterior borrado)\n";
    } catch (Exception $e) { /* Ignore if not exists */ }

    // Try dropping constraint name if it was created differently
    try {
        $db->exec("ALTER TABLE clients DROP INDEX client_code");
    } catch (Exception $e) { /* Ignore */ }


    $sqlIndex = "ALTER TABLE clients ADD UNIQUE INDEX idx_unique_client_code (client_code)";
    $db->exec($sqlIndex);
    echo "   OK (Índice Único Creado).\n";

    echo "\n---------------------------------------------------\n";
    echo "¡LISTO! La tabla 'clients' está vacía y configurada correctamente.\n";
    echo "Ya puedes volver a importar tu archivo Excel/CSV y actualizara datos en lugar de duplicarlos.\n";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
