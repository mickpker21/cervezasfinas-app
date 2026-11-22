# Cervezas Finas CRM

Aplicación React + Supabase con micro API Express para gestión de usuarios y dashboards (Conquista, Control Interno, Supervisor, Admin).

## Características Clave
- Frontend: React 18, Vite, Tailwind (shadcn UI), react-leaflet.
- Backend: Supabase (Auth + RLS + Storage) + API Express (service role) para creación / actualización de usuarios.
- Roles: admin, supervisor, conquista, control-interno (más tipos futuros) con políticas RLS específicas.
- Seguridad: RLS granular, función `public.is_admin()`, restricciones por rutas supervisor, políticas específicas de lectura para admin y control-interno.

## Estructura
```
src/
  pages/ ...
  components/ ...
  contexts/ ...
  lib/ ...
  utils/ ...
tools/
  updateUserMetadata.js  # API Express service role
migraciones SQL (*.sql) # Ejecutar en Supabase
```

## Variables de Entorno
Copiar `.env.example` a `.env` y completar.

| Variable | Descripción |
|----------|-------------|
| SUPABASE_URL | URL del proyecto Supabase |
| SUPABASE_SERVICE_KEY | Service role key (NO exponer en frontend) |
| SUPABASE_ANON_KEY | Anon key pública (validación en middleware) |
| CORS_ORIGIN | Lista de orígenes permitidos (coma) |
| PORT | Puerto API Express |
| LOG_LEVEL | Nivel logs (debug,info,warn,error) |
| ADMIN_BYPASS_SECRET | Clave temporal bootstrap (eliminar tras primer admin) |
| VITE_SUPABASE_URL | URL Supabase para frontend |
| VITE_SUPABASE_ANON_KEY | Anon key pública |
| VITE_API_BASE_URL | Base URL API (para fetch create-user/update-user-metadata) |
| VITE_ADMIN_BYPASS_SECRET | Bypass sólo durante bootstrap |

## Scripts
- `npm run dev` Inicia frontend Vite.
- `npm run api` Inicia API Express (service role).
- `npm run build` Build de producción.

## API Endpoints
Base: `${PORT || 4000}/api`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /create-user | Crea usuario (requiere admin) |
| POST | /update-user-metadata | Actualiza metadata (requiere admin) |
| GET | /health | Healthcheck + versión |
| GET | /debug/config | Info mínima (solo dev) |

Todas responden con shape uniforme:
```
{
  success: true/false,
  data?: {...},
  error?: 'CODIGO',
  details?: 'Mensaje'
}
```

## Seguridad API
- Service Key sólo en backend.
- CORS restringido por `CORS_ORIGIN`.
- `helmet` + `express-rate-limit` aplicado.
- Middleware `authenticateAdmin` verifica:
  1. Bearer token válido (Supabase)
  2. Rol `admin` en tabla `profiles`
  3. (Temporal) header `x-admin-secret` si `ADMIN_BYPASS_SECRET` definido

## Despliegue (Render)
### Servicios separados
1. Web Service API: Start `npm run api`, Health `/api/health`.
2. Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, CORS_ORIGIN, LOG_LEVEL, PORT=4000, ADMIN_BYPASS_SECRET (temporal).
3. Static Site: Build `npm run build`, Publish dir `dist/`, env `VITE_API_BASE_URL=https://<api-url>`.
4. Crear primer admin con bypass.
5. Eliminar bypass vars y redeploy.
6. Ajustar CORS a dominio definitivo.

### Servicio único (opcional)
Agregar al final del server (antes de listen):
```js
import path from 'node:path';
app.use(express.static('dist'));
app.get('*', (req,res)=>res.sendFile(path.resolve('dist/index.html')));
```
Build + Start `node tools/updateUserMetadata.js`.

## Bootstrap Primer Admin
1. Definir `ADMIN_BYPASS_SECRET` (API) y `VITE_ADMIN_BYPASS_SECRET` (frontend).
2. Crear usuario role=admin (pasa middleware por header secreto).
3. Verificar en `profiles`.
4. Quitar secrets y redeploy.

## Migraciones / SQL
Ejecutar en orden (recomendar prefijar numéricamente):
1. funciones base (is_admin, supervisor_can_see_client)
2. tablas: supervisor_allowed_routes, supervisor_allowed_sales_routes
3. policies admin (clients, visitas, evaluaciones)
4. policies supervisor
5. policies control-interno (lectura clients)
6. migracion_add_password_flags.sql (agrega must_change_password, password_changed_at + RPC finish_password_change)
7. supabase_policy_profiles_password_flags.sql (políticas actualización segura de flags)

## Próximos Mejoras Sugeridas
- Enum para roles consistente.
- Auditoría (`logs_admin_actions`).
- Logger estructurado.
- Tests unitarios ligeros para utilidades.
- Reemplazar borrado de flag en metadata (ya no necesario) y confiar solo en columna profiles.
- Endpoint/RPC adicional para admins que fuerce nuevamente el flag.

## Troubleshooting
- 401 / datos vacíos: renovar sesión (invalid refresh token) o revisar RLS.
- create-user 409: email ya registrado.
- create-user 400 WEAK_PASSWORD: reforzar contraseña.
- update-user-metadata 400: falta user_id/type.
- 401 NO_AUTH: falta token.
- 403 FORBIDDEN: usuario sin rol admin.
- 500 CREATE_FAILED: revisar logs server (posible falta de permisos service key).

## Licencia
Privado.
