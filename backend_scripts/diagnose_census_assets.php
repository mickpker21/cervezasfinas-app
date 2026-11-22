<?php
header("Content-Type: text/plain; charset=UTF-8");
include_once 'db_config.php';

try {
    $pdo = getDBConnection();

    echo "--- UNIQUE MODELS (ENFRIADORES) ---\n";
    $q1 = $pdo->query("SELECT DISTINCT modelo FROM censos_supervisor WHERE tiene_enfriador = 1 AND modelo IS NOT NULL AND modelo != ''");
    while($row = $q1->fetch()) {
        echo "- " . $row['modelo'] . "\n";
    }

    echo "\n--- UNIQUE FACADE TYPES ---\n";
    $q2 = $pdo->query("SELECT DISTINCT tipo_fachada FROM censos_supervisor WHERE tiene_fachada = 1 AND tipo_fachada IS NOT NULL AND tipo_fachada != ''");
    while($row = $q2->fetch()) {
        echo "- " . $row['tipo_fachada'] . "\n";
    }

    echo "\n--- ASSET TYPES IN SYSTEM ---\n";
    // This depends on where asset_types are stored. If they are in a table:
    try {
        $q3 = $pdo->query("SELECT name FROM asset_types ORDER BY name");
        while($row = $q3->fetch()) {
            echo "- " . $row['name'] . "\n";
        }
    } catch (Exception $e) {
        echo "Note: asset_types table not found in MySQL, might be in SQLite/Supabase only.\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
