<?php
include_once 'db_config.php';
try {
   $pdo = getDBConnection();
   echo "Connected to DB";
} catch (Exception $e) {
   echo "Error: ". $e->getMessage();
}
