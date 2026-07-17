# CLAUDE.md

## Resumen del proyecto

Marketplace de servicios freelance en Colombia (MVP). Stack: Expo/React Native (SDK 57) + TypeScript + Expo Router, Supabase (Postgres + Auth + RLS) vía `@supabase/supabase-js` tipado con `createClient<Database>` (tipos generados en `lib/database.types.ts`, regenerar con `npm run gen:types`), `@tanstack/react-query` v5 para data-fetching, react-hook-form + Zod para formularios, NativeWind (Tailwind para RN), Jest (`jest-expo`, pinned `^29`) + React Native Testing Library v14 para tests. Flujo de trabajo estándar del proyecto: **brainstorming → spec → plan → subagent-driven-development**, con TDD en toda tarea de código. Cada sub-proyecto termina con un review holístico del branch completo antes de mergear a `main`.

## Mapa de directorios

```
app/                    Rutas Expo Router
  (auth)/                 login, register, verify-phone, onboarding
  (tabs)/                 index (feed), post-task, my-tasks, profile
  task/[id].tsx            detalle de tarea
  offer/create.tsx         crear oferta
features/
  auth/                    AuthProvider, useAuth, gate.ts, schemas, errors, actions
  tasks/                   types, schemas, api.ts, hooks.ts (taskKeys factory), format.ts
  offers/                  types, schemas, api.ts, hooks.ts (offerKeys factory)
components/
  tasks/                   TaskCard, PostTaskForm, PublishedTaskRow, TaskActionZone
  offers/                  OfferForm, OfferListItem, MyOfferRow
  ui/                      primitivos compartidos
lib/                     cliente Supabase, utils, env
supabase/migrations/     schema, RLS policies, triggers, accept_offer() RPC
docs/superpowers/        specs/ y plans/ de cada sub-proyecto (registro histórico)
```

Para el detalle de un archivo puntual, seguir usando Read/Grep — este mapa es para orientación, no un índice exhaustivo.

## Convenciones y patrones establecidos

### Testing
- Todo `fireEvent.*` debe llevar `await` (no solo `press`, también `changeText`) — quirk confirmado de RNTL v14 + RN 0.86 + React 19: sin `await` corrompe el tracking de `act()` entre tests.
- `jest` fijado en `^29` (constraint de `jest-expo@57`); `test-renderer` es dependencia real, no typosquat.
- Si hay otro worktree bajo `.claude/worktrees/` o `.worktrees/` al correr `npm test` desde la raíz, Jest duplica/infla el conteo — usar `npx jest --testPathIgnorePatterns "/node_modules/|/\.claude/"`.
- Verificar conteos de tests siempre en vivo, nunca confiar en un número de una memoria o plan anterior.

### RLS/Supabase
- El razonamiento de "alcanzabilidad RLS" (qué combinaciones rol×estado son realmente alcanzables) ha atrapado bugs reales varias veces — aplicarlo antes de asumir que un estado "no debería pasar".
- Una fila embebida ocultada por RLS llega como `null`, no como un objeto inaccesible — tratar `null` como señal significativa, no solo "dato faltante".
- `profiles_public` no se puede embeber directo desde `tasks` en PostgREST (sin FK propia); el info del cliente se trae con una query aparte, unida en el cliente.
- Las políticas/triggers RLS son la defensa real (defense-in-depth) detrás de cualquier restricción de UI — verificar la policy/trigger, no solo que el botón esté oculto.
- Columnas `text + CHECK` (ej. `tasks.status`, `offers.status`) generan como `string` en `database.types.ts`, no como unión literal — `Task`/`Offer` las angostan explícitamente (`Omit<Row,'status'> & {status: TaskStatus}`) para preservar los switches exhaustivos.
- Las columnas de una vista (ej. `profiles_public.id`) siempre generan nullable en `database.types.ts`, aunque la tabla base tenga esa columna como `not null` — verificar la definición real de la vista antes de asumir que un `!` es seguro, no asumirlo por similitud con la tabla base.

### React Query
- Patrón de factory `xKeys` (`all` / `lists()` / `list(filter)` / `detail(id)`) con invalidación por prefijo.
- `staleTime: Infinity` para catálogos estáticos (ej. categorías).
- Un estado `pending` compartido por hook (no por fila) que deshabilita toda una lista durante una mutación es un tradeoff aceptado a escala MVP.

### Componentes
- Switches exhaustivos sin `default` sobre uniones tipo `TaskStatus` (error de compilación si falta un caso, no un mis-render silencioso).
- `Pressable`s hermanos, no anidados (evita bugs de propagación táctil).
- `router.replace` (no `push`) después de completar un formulario y salir de la pantalla.
- Todo mutation call site necesita `mapAuthError` + texto de error inline — ninguno debe fallar en silencio.
- Diálogos de confirmación usan pares `'Volver'/'Sí, <acción>'`, nunca dos botones ambiguos tipo "Cancelar".

### Flujo de trabajo
- brainstorming → spec → plan → subagent-driven-development, TDD en todo.
- Todo dispatch de subagente revisor debe incluir la instrucción read-only-git (no `git checkout`/`reset`/`stash`/`clean`/`add`/`commit`; solo `git show`/`log`/`diff`/`cat`/Read).
- Un review holístico final del branch completo (no solo por tarea) atrapa problemas de integración que el review por tarea no ve.
- `npm install` obligatorio tras mergear una rama que agregó dependencias, antes de confiar en `tsc`/tests sobre `main`.

## Estado actual / pendientes

Docker Desktop quedó sano el 2026-07-16 (se arregló con "Reset to factory defaults" tras semanas caído por un socket `dockerInference` corrupto) — sigue algo inestable (se cerró solo un par de veces más ese mismo día, un relanzamiento simple lo resolvió cada vez). El roadmap original del MVP está completo: backend, frontend completo, integración real de SMS (Twilio Verify, verificada en vivo), cancelar tarea abierta, y migración a `supabase gen types`. Único pendiente real: un round-trip de SMS con credenciales reales de Twilio (el usuario debe crear esa cuenta, Claude no puede).
