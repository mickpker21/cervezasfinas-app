<?php
// =====================================================
// DIAGNÓSTICO TEMPORAL - ELIMINAR DESPUÉS DE USAR
// Sube a: cervezasfinas.com/api/test-gemini.php
// =====================================================
header("Content-Type: application/json; charset=UTF-8");

include_once 'db_config.php';

$apiKey = defined('GEMINI_API_KEY') ? GEMINI_API_KEY : 'NO DEFINIDA';
$apiKeyMasked = 'NO DEFINIDA';
if ($apiKey !== 'NO DEFINIDA') {
    $apiKeyMasked = substr($apiKey, 0, 8) . '...' . substr($apiKey, -4);
}

$results = [];

// 1. Verificar que la API Key existe
$results['api_key_status'] = ($apiKey !== 'NO DEFINIDA') ? 'OK - Definida (' . $apiKeyMasked . ')' : 'ERROR - No definida';

// 2. Verificar si cURL está disponible
$results['curl_disponible'] = function_exists('curl_init') ? 'OK' : 'ERROR - cURL no disponible';

// 3. Probar conectividad básica a Google
$ch = curl_init('https://www.google.com');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);
curl_setopt($ch, CURLOPT_NOBODY, true);
curl_exec($ch);
$googleCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError  = curl_error($ch);
curl_close($ch);
$results['conectividad_google'] = $googleCode > 0 
    ? "OK - HTTP $googleCode" 
    : "ERROR - " . ($curlError ?: 'Sin respuesta');

// 4. Probar los 3 modelos de Gemini
$models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'];

foreach ($models as $model) {
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . $model 
         . ':generateContent?key=' . $apiKey;

    $payload = json_encode([
        "contents" => [["parts" => [["text" => "Di solo: HOLA"]]]]
    ]);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);

    $resp     = curl_exec($ch);
    $code     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    $respData = json_decode($resp, true);
    $geminiError = $respData['error']['message'] ?? null;

    if ($code === 200) {
        $reply = $respData['candidates'][0]['content']['parts'][0]['text'] ?? '(sin texto)';
        $results["modelo_$model"] = "✅ OK - Respuesta: " . trim($reply);
    } elseif ($curlErr) {
        $results["modelo_$model"] = "❌ ERROR cURL: $curlErr";
    } elseif ($geminiError) {
        $results["modelo_$model"] = "❌ HTTP $code - Gemini: $geminiError";
    } else {
        $results["modelo_$model"] = "❌ HTTP $code - Sin detalle";
    }
}

echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
?>
