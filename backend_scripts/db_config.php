<?php
// Database configuration
// This file should be uploaded to the same directory as clients-read.php and clients-import.php

function getDBConnection() {
    $host = 'localhost';
    $dbname = 'u815168173_um6pos';
    $user = 'u815168173_um6user';
    $pass = 'Rsfl284@';

    try {
        $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $pdo;
    } catch(PDOException $e) {
        // Return null or throw, depending on how you want to handle connection failure
        // For API usage, throwing is fine as specific scripts catch it.
        throw $e;
    }
}

// =============================================================
// CONFIGURACIÓN DE IA - ASISTENTE SOFÍA (Google Gemini)
// =============================================================
// Obtén tu clave GRATIS en: https://aistudio.google.com/app/apikey
// Plan gratuito: 15 req/min · 1,500 req/día · 1M tokens/mes
// =============================================================
define('GEMINI_API_KEY', 'AIzaSyDDbPhhpjeKZb7EDiarn8qgR3tw8RES6h4');
?>
