# MVP Marketplace de Servicios Freelance (Colombia) — Diseño

**Fecha:** 2026-07-02
**Estado:** Aprobado para pasar a plan de implementación

## Contexto y alcance

App móvil tipo Airtasker para Colombia: un mismo usuario puede publicar tareas (cliente) y ofertar en tareas de otros (freelancer) con una sola cuenta, sin rol fijo.

El proyecto completo (marketplace + pagos/escrow + mensajería + reputación) es demasiado grande para una sola spec. Este documento cubre **únicamente el sub-proyecto núcleo**:

- Autenticación (email + teléfono)
- Publicar y buscar tareas
- Ofertar en tareas (modelo de subasta, estilo Airtasker)
- Aceptar una oferta y marcar la tarea como completada

**Explícitamente fuera de alcance de este documento** (se abordarán en specs propias más adelante):

- Pagos, escrow, e integración con PSE/agregadores de pago (Wompi, PayU, etc.). Nota regulatoria: en Colombia no es viable conectar directo con Bancolombia/Nequi; se requiere un agregador autorizado por la Superintendencia Financiera, y el escrow real requeriría licencia SEDPE o alianza con una entidad que ya la tenga (Nequi, Movii, Powwi). El esquema actual (`tasks.budget_reference`, `offers.price`) es compatible con agregar una tabla `payments` después sin romper nada.
- Mensajería/chat entre cliente y freelancer.
- Sistema de reviews/reputación (se deja placeholder visual en el frontend, sin datos reales).
- Verificación de identidad (cédula/KYC).
- Perfiles enriquecidos (bio, habilidades, portafolio).

## Decisiones de stack

| Área | Decisión | Motivo |
|---|---|---|
| App móvil | React Native con Expo | El usuario tiene experiencia en JS/TS; ecosistema maduro |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) | RLS nativo de Postgres, requerido explícitamente; evita mantener infraestructura propia |
| Comunicación app↔backend | Cliente Supabase directo desde la app, protegido por RLS; funciones Postgres `SECURITY DEFINER` para operaciones atómicas; Edge Functions solo donde se necesite lógica server-side adicional | RLS como perímetro de seguridad real, mínima superficie de infraestructura a mantener |
| Navegación | Expo Router (stack + tabs) | Estándar en el ecosistema Expo actual |

## Arquitectura

```
App (Expo/React Native)
   │  Supabase JS SDK (anon key)
   ▼
Supabase Auth  ──┐
Supabase Storage ─┼──►  Postgres (RLS habilitado en todas las tablas)
Edge Functions   ─┘        └── Funciones SECURITY DEFINER para transiciones de estado atómicas
```

Operaciones simples (leer tareas, crear tarea, crear oferta) van directo del cliente a Postgres, autorizadas exclusivamente por políticas RLS. La única operación que requiere atomicidad multi-tabla (aceptar una oferta) pasa por una función `SECURITY DEFINER` invocada vía RPC, evitando condiciones de carrera y manteniendo RLS como mecanismo de defensa consistente.

## Modelo de datos

| Tabla | PK | Campos clave | Notas |
|---|---|---|---|
| `profiles` | `id uuid` (= `auth.users.id`) | `full_name`, `phone`, `phone_verified`, `avatar_url`, `city`, `created_at` | 1:1 con Supabase Auth, creada por trigger `on_auth_user_created` |
| `categories` | `id smallint` (serial) | `name`, `slug`, `icon` | Catálogo fijo, sembrado por migración; sin riesgo de enumeración por ser públicas |
| `tasks` | `id uuid` | `client_id`→profiles, `category_id`→categories, `title`, `description`, `budget_reference`, `city`, `address_approx`, `status` (`open`\|`assigned`\|`completed`\|`cancelled`), `assigned_freelancer_id`, `created_at`, `updated_at` | |
| `offers` | `id uuid` | `task_id`→tasks, `freelancer_id`→profiles, `price`, `message`, `status` (`pending`\|`accepted`\|`rejected`\|`withdrawn`), `created_at` | Constraint: `freelancer_id <> tasks.client_id`; unique `(task_id, freelancer_id)` |

UUID como PK en `profiles`/`tasks`/`offers` (consistencia con `auth.uid()` y prevención de enumeración). `categories` usa `smallint` por ser catálogo público sin riesgo.

### Ciclo de vida de una tarea

`open` → (recibe ofertas `pending`) → `accept_offer(offer_id)` → oferta ganadora `accepted`, resto `rejected`, tarea → `assigned` (+`assigned_freelancer_id`) → cliente marca `completed`. Cancelación (`cancelled`) solo permitida mientras `status = 'open'`.

## Políticas RLS

**`profiles`**
- `SELECT`: campos públicos (nombre, ciudad, avatar) visibles para cualquier autenticado vía vista `profiles_public` (sin `phone`). El campo `phone` completo solo visible para `auth.uid() = id`.
- `INSERT`/`UPDATE`: solo `auth.uid() = id`.
- `DELETE`: bloqueado (fuera de alcance del MVP).

**`categories`**
- `SELECT`: público para autenticados.
- `INSERT`/`UPDATE`/`DELETE`: bloqueado vía RLS; gestión solo con `service_role` key desde administración.

**`tasks`**
- `SELECT`: `status = 'open'` (público) OR `client_id = auth.uid()` OR `assigned_freelancer_id = auth.uid()`.
- `INSERT`: `client_id = auth.uid()` obligatorio.
- `UPDATE`: solo `client_id = auth.uid()`, solo mientras `status IN ('open','assigned')`. Trigger `BEFORE UPDATE` rechaza escritura directa de `status = 'assigned'` (solo permitido vía `accept_offer()`).
- `DELETE`: solo `client_id = auth.uid()` y solo si `status = 'open'`.

**`offers`**
- `SELECT`: `freelancer_id = auth.uid()` OR (`auth.uid()` es dueño de la tarea referenciada).
- `INSERT`: `freelancer_id = auth.uid()`, con `CHECK` de `tasks.status = 'open'` y `freelancer_id <> tasks.client_id`.
- `UPDATE`: el freelancer solo puede pasar su propia oferta de `pending` a `withdrawn`. Transición a `accepted`/`rejected` bloqueada por RLS directa; solo ocurre dentro de `accept_offer()`.

**Función `accept_offer(offer_id uuid)`** (`SECURITY DEFINER`, `search_path` fijado explícitamente): valida `auth.uid() = tasks.client_id` y `tasks.status = 'open'`; en una sola transacción marca la oferta ganadora `accepted`, el resto de ofertas de esa tarea `rejected`, y la tarea `assigned`.

## Flujo de autenticación

1. Registro con email + contraseña → email de verificación (Supabase Auth).
2. Verificación de celular por SMS OTP → `profiles.phone_verified = true`.
3. Trigger crea automáticamente la fila `profiles` al registrarse.
4. Onboarding mínimo: nombre completo, ciudad, foto de perfil (opcional).
5. Sesión persistida con Expo SecureStore (Keychain/Keystore nativo, no `AsyncStorage` plano).

## Navegación (Expo Router)

```
(auth)/login.tsx, register.tsx, verify-phone.tsx, onboarding.tsx
(tabs)/index.tsx        → Feed de tareas abiertas cerca de mi ciudad
(tabs)/my-tasks.tsx     → Mis tareas publicadas + tareas donde soy freelancer asignado
(tabs)/post-task.tsx    → Formulario: categoría, título, descripción, presupuesto ref., ciudad/dirección
(tabs)/profile.tsx      → Ver/editar mi perfil
task/[id].tsx           → Detalle de tarea + lista de ofertas (si soy dueño) + botón "Ofertar"
offer/create.tsx        → Formulario de oferta (precio + mensaje)
```

Nota de UX: el feed y detalle de tarea deben reservar espacio visual para rating/reputación desde ya (placeholder), aunque el sistema real de reviews se construya en una fase posterior.

## Seguridad

CORS y security headers de navegador no aplican al tráfico nativo de la app (React Native no los interpreta), pero sí a la superficie HTTP propia del proyecto:

- **Edge Functions**: CORS restringido (sin `Access-Control-Allow-Origin: *`), rate limiting por IP/usuario, headers `Strict-Transport-Security` y `X-Content-Type-Options: nosniff`.
- **Sesión**: tokens en Expo SecureStore, nunca en `AsyncStorage` sin cifrar.
- **Claves**: solo `anon key` en el bundle de la app (pública por diseño, protegida por RLS); `service_role key` nunca sale del entorno de administración/CI.
- **Rate limiting**: límites en Supabase Auth (login/OTP) y en la función de creación de ofertas/tareas, para evitar spam.
- **Postgres**: funciones `SECURITY DEFINER` con `search_path` fijado explícitamente; FKs con `ON DELETE` explícito.
- **Validación de inputs**: Zod en cliente + `CHECK` constraints en Postgres (no confiar solo en el cliente).

## Testing

- **RLS**: suite `pgTAP` (o integración contra Supabase local vía Docker) cubriendo explícitamente casos negativos (ej. "un freelancer no puede leer el teléfono de otro perfil", "no se puede aceptar una oferta de una tarea ajena", "no se puede ofertar en la propia tarea").
- **`accept_offer`**: test de concurrencia (dos llamadas simultáneas → solo una oferta `accepted`).
- **App**: Jest + React Native Testing Library en pantallas críticas (publicar tarea, crear oferta).
- **E2E**: Maestro o Detox sobre el happy path completo (registro → publicar → ofertar → aceptar → completar) antes de cada release.

## Próximos sub-proyectos (fuera de este documento)

1. Pagos/escrow (Wompi/PSE, consideraciones SEDPE)
2. Mensajería in-app (Supabase Realtime)
3. Reviews y reputación
4. Verificación de identidad (cédula/KYC)
5. Perfiles enriquecidos (bio, habilidades, portafolio)
