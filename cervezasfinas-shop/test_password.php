<?php
// Script de prueba para generar y verificar password hash

$password = 'password123';

// Generar nuevo hash
$new_hash = password_hash($password, PASSWORD_DEFAULT);

echo "=== GENERADOR DE PASSWORD HASH ===\n\n";
echo "Password: password123\n\n";
echo "Hash generado (NUEVO):\n";
echo $new_hash . "\n\n";

// Hash que está en la BD según la imagen
$db_hash = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

echo "Hash en BD (según imagen):\n";
echo $db_hash . "\n\n";

// Verificar si el hash de la BD funciona
$verify_result = password_verify($password, $db_hash);
echo "¿El hash de la BD verifica correctamente? " . ($verify_result ? "SÍ ✓" : "NO ✗") . "\n\n";

// SQL para actualizar
echo "=== SQL PARA ACTUALIZAR ===\n\n";
echo "UPDATE shop_client_users \n";
echo "SET password_hash = '" . $new_hash . "'\n";
echo "WHERE client_code = 'TEST001';\n";
?>
