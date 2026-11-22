# UM6 POS API

Backend Express + MySQL para soportar el nuevo flujo de puntos de venta UM6. Supabase solo se usa para autenticar usuarios (GoTrue).

## Requisitos

- Node.js >= 18
- Servidor MySQL accesible (local, Hostinger, PlanetScale, RDS, etc.)
- Proyecto Supabase existente con llave `service_role`

## Instalación

```bash
cd backend/um6-pos
npm install
cp .env.example .env
# Rellena las variables de entorno con tus credenciales reales
npm run setup   # aplica schema.sql y carga catálogos base
```

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto del API (5050 por defecto) |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | Credenciales de MySQL |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave `service_role` para validar tokens |

## Scripts

- `npm run dev` → arranca el server con `nodemon`.
- `npm start` → arranca el server en modo producción.
- `npm run setup` → ejecuta `sql/schema.sql` y los seeds de `data/*.json`.

## Crear base de datos MySQL

Ejecuta en tu cliente MySQL:

```sql
CREATE DATABASE um6_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'um6_app'@'%' IDENTIFIED BY 'CambiarEstaClave!';
GRANT ALL PRIVILEGES ON um6_pos.* TO 'um6_app'@'%';
FLUSH PRIVILEGES;
```

Después aplica el esquema y catálogos base:

```bash
npm run setup
```

El script lee `sql/schema.sql` y los archivos dentro de `data/`:

- `data/stores.json` → códigos UM6 (deben coincidir con el `route` del usuario en Supabase).
- `data/products.json` → catálogo mínimo del POS.
- `data/inventory.json` → inventario inicial, máximos y mínimos.

Modifica esos JSON antes de correr el script para reflejar tus PDV reales.

### Conexiones remotas (Hostinger, etc.)

1. En el panel habilita el acceso remoto de MySQL y agrega tu IP pública.
2. Copia el servidor que muestran (ej. `srvXXXX.hstgr.io`) y úsalo en `MYSQL_HOST`. 127.0.0.1 solo funcionará si el servidor corre en tu máquina.
3. Ejecuta `npm run setup`. `ECONNREFUSED` → el puerto 3306 sigue bloqueado. `ENOTFOUND` → el nombre del servidor es incorrecto.
4. Una vez poblada la base, levanta el API (`npm run dev`) y después el frontend (`npm run dev` en la raíz del proyecto).

## Endpoints implementados

Autenticación: envía `Authorization: Bearer <token Supabase>` en cada request. El middleware valida el rol (`UM6` o `gerente`).

### Salud / tienda

- `GET /health` → prueba conexión MySQL.
- `GET /api/stores/me` → tienda ligada al `route` del usuario UM6; gerencia puede pasar `?storeCode=UM6PALMARITO`.
- `GET /api/stores/me/inventory` → inventario con niveles min/máx.

### POS (solo `UM6`)

- `POST /api/pos/sales`  
  ```json
  {
    "reference": "ticket-123",
    "items": [
      { "productId": 10, "quantity": 3 }
    ]
  }
  ```  
  Registra ventas, descuenta inventario y crea movimientos `SALE`.

- `POST /api/pos/movements` (ajustes, entradas manuales)  
  Solo gerencia puede llamar este endpoint; acepta `ADJUSTMENT | STOCK_IN | STOCK_OUT`.

### Pedidos

- `GET /api/orders` → UM6 ve solo los suyos; gerencia puede pasar `?storeCode=` o dejarlo vacío para ver hasta 100 pedidos.
- `POST /api/orders` (`gerente`) → crea pedidos en `IN_TRANSIT`.
- `PATCH /api/orders/:orderId/status` (`gerente`) → actualiza el estado (`DRAFT`, `SENT`, `IN_TRANSIT`, `REJECTED`).
- `POST /api/orders/:orderId/accept` (`UM6`) → valida que el pedido sea de su tienda, genera movimientos `ORDER_ACCEPT` y suma inventario.

### Planogramas

- `GET /api/planograms/me` (`UM6`) → último planograma asignado al PDV.
- `GET /api/planograms?storeCode=...` (`gerente`) → historial (máximo 100 registros).
- `POST /api/planograms` (`gerente`) → registra versión `{ "storeCode": "...", "fileUrl": "https://..." }`.

## Próximos pasos recomendados

1. Conectar estas rutas al frontend React (pantallas UM6 y gerencia).
2. Agregar validaciones adicionales (umbrales, stock negativo, etc.).
3. Incorporar colas o jobs si necesitas sincronizar con otros sistemas.
