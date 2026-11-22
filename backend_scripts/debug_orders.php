<?php
header("Content-Type: text/plain; charset=UTF-8");
include_once 'db_config.php';

try {
    $pdo = getDBConnection();

    echo "--- TABLE COUNTS ---\n";
    $q1 = $pdo->query("SELECT COUNT(*) as total FROM installation_orders");
    echo "installation_orders: " . $q1->fetch()['total'] . "\n";

    $q2 = $pdo->query("SELECT COUNT(*) as total FROM clients");
    echo "clients: " . $q2->fetch()['total'] . "\n";

    echo "\n--- JOIN TEST ---\n";
    $sql = "SELECT o.id as order_id, o.client_id, c1.id as client_id_pk, c1.name, c1.client_code
            FROM installation_orders o
            LEFT JOIN clients c1 ON o.client_id = c1.id
            LIMIT 50";
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo "Query returned " . count($rows) . " rows.\n";
    foreach ($rows as $row) {
        printf("Order: %s | Order.client_id: %s | Client.id: %s | Name: %s | Code: %s\n", 
            $row['order_id'], $row['client_id'], $row['client_id_pk'], $row['name'], $row['client_code']);
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
