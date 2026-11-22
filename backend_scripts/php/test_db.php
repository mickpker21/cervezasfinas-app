<?php
// backend_scripts/php/test_db.php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

echo "<h1>Database Connection Test</h1>";

include 'db.php';

try {
    if (isset($pdo)) {
        echo "<p style='color:green'><strong>SUCCESS:</strong> Connection variable \$pdo exists.</p>";
        $stmt = $pdo->query("SELECT 1");
        if ($stmt) {
             echo "<p style='color:green'><strong>SUCCESS:</strong> Simple query 'SELECT 1' executed.</p>";
        } else {
             echo "<p style='color:red'><strong>FAILURE:</strong> Query failed.</p>";
        }
    } else {
        echo "<p style='color:red'><strong>FAILURE:</strong> \$pdo variable not found after include.</p>";
    }
} catch (Exception $e) {
    echo "<p style='color:red'><strong>EXCEPTION:</strong> " . $e->getMessage() . "</p>";
}
?>
