<?php
header("Content-Type: text/plain; charset=UTF-8");
include_once 'db_config.php';

try {
    $pdo = getDBConnection();

    echo "--- SCHEMA: installation_orders ---\n";
    $q = $pdo->query("DESCRIBE installation_orders");
    while($row = $q->fetch()) {
        printf("%-20s | %-15s | %-5s\n", $row['Field'], $row['Type'], $row['Null']);
    }

    echo "\n--- SCHEMA: clients ---\n";
    $q = $pdo->query("DESCRIBE clients");
    while($row = $q->fetch()) {
        printf("%-20s | %-15s | %-5s\n", $row['Field'], $row['Type'], $row['Null']);
    }

    echo "\n--- SAMPLE ID COMPARISON ---\n";
    $q = $pdo->query("SELECT client_id FROM installation_orders LIMIT 1");
    $order_client_id = $q->fetch()['client_id'];
    echo "Order client_id value: [$order_client_id] (Type: " . gettype($order_client_id) . ")\n";

    $q = $pdo->query("SELECT id, name FROM clients WHERE id LIKE '$order_client_id%' LIMIT 20");
    echo "Matching clients for '$order_client_id%':\n";
    while($row = $q->fetch()) {
        printf("Client ID: %s | Name: %s\n", $row['id'], $row['name']);
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
