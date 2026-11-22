<?php
require_once 'common.php';

try {
    $pdo = getDB();
    $stmt = $pdo->query("SHOW TABLES");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    echo "<h1>Tablas en la Base de Datos</h1>";
    echo "<ul>";
    foreach ($tables as $table) {
        echo "<li>$table</li>";
    }
    echo "</ul>";

    // Verificar si existe la tabla 'clients' y mostrar columnas
    if (in_array('clients', $tables)) {
        echo "<h2>Columnas de 'clients'</h2>";
        $stmt = $pdo->query("DESCRIBE clients");
        $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo "<pre>" . json_encode($columns, JSON_PRETTY_PRINT) . "</pre>";
    } else {
        echo "<h2>La tabla 'clients' NO existe</h2>";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
