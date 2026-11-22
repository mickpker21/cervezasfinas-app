<?php
// test-push.php
// Ejecutar desde el navegador para probar el sistema de push.

require_once 'send-push.php';

$test_token = $_GET['token'] ?? null;
if (!$test_token) {
    die("Error: Proporciona un token vía ?token=... (puedes obtenerlo de la consola de la App)");
}

$data = [
    "token" => $test_token,
    "title" => "Prueba de Sistema",
    "body" => "Si ves esto, las notificaciones Push están funcionando correctamente. 🚀",
    "data" => [
        "url" => "/admin/dashboard"
    ]
];

// Enviar usando el script existente
// Nota: send-push.php espera un POST JSON, pero aquí podemos llamar a las funciones directamente si las exportamos
// O simplemente hacer un request interno.

// Para hacerlo simple, voy a simular el input para send-push.php
$_POST = $data; 
// O mejor, solo llamar a la lógica de envío directamente.

echo "Intentando enviar a: $test_token...\n";

// Re-usando la lógica de send-push.php
// (Como send-push.php termina con exit, no podemos incluirlo y esperar que siga el flujo)
// Así que solo copiaremos la parte de test aquí o lo invocaremos via cURL.

$url = "http://" . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']) . "/send-push.php";

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

$response = curl_exec($ch);
$info = curl_getinfo($ch);
curl_close($ch);

echo "Respuesta del Servidor (HTTP " . $info['http_code'] . "):\n";
echo $response;
