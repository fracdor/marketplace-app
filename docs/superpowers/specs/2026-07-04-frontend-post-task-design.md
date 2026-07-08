# Frontend App — Publicar Tarea (Diseño)

**Fecha:** 2026-07-04
**Estado:** Aprobado para pasar a plan de implementación
**Specs de referencia:** [2026-07-02-mvp-marketplace-design.md](2026-07-02-mvp-marketplace-design.md) · [2026-07-03-frontend-app-scaffold-auth-design.md](2026-07-03-frontend-app-scaffold-auth-design.md) · [2026-07-04-frontend-feed-task-detail-design.md](2026-07-04-frontend-feed-task-detail-design.md)

## Contexto y alcance

Tercer sub-proyecto del frontend, sobre el scaffold+auth y el feed+detalle ya fusionados a `main`. Cubre:

- Formulario de publicar tarea: categoría (selector con modal), título, descripción, presupuesto de referencia (opcional), ciudad, dirección aproximada (opcional).
- Inserta la tarea en `tasks` (RLS `tasks_insert_own` garantiza `client_id = auth.uid()`).
- Al publicar con éxito: invalida la cache de tareas abiertas y navega al tab Feed, donde la tarea recién creada ya aparece (más reciente primero).

**Explícitamente fuera de alcance** (sub-proyectos siguientes):

- Editar o borrar tareas propias.
- Subir fotos/adjuntos.
- Geolocalización real (`address_approx` es texto libre, no un mapa/picker de ubicación).
- Ofertar, ver ofertas, aceptar oferta, tab "Mis tareas" (siguen esperando al sub-proyecto de ofertas).

## Decisiones de diseño

**Selector de categoría:** modal (bottom-sheet) nativo de React Native que lista las 8 categorías; el campo del formulario es un `Pressable` que muestra la categoría elegida y abre el modal al tocar. (Alternativa de chips visibles evaluada y descartada por el usuario a favor del modal.)

**Presupuesto de referencia:** opcional en el formulario, igual que en la base de datos — coincide con cómo `formatBudget` ya maneja el caso nulo ("Presupuesto a convenir") en el feed y el detalle.

**Dirección aproximada:** incluida como campo opcional, texto libre — da contexto adicional al freelancer sin ser obligatoria.

**Navegación post-envío:** al tab Feed (no al detalle de la tarea recién creada). Más simple, reutiliza la pantalla existente.

## Categorías: por qué se consultan, no se hardcodean

Los `id` de `categories` los asigna Postgres por `generated always as identity`, según el orden de inserción del seed — un valor frágil para hardcodear en el cliente. Si la tabla llegara a re-sembrarse en otro ambiente con otro orden, un `category_id` hardcodeado insertaría silenciosamente la categoría equivocada en una tarea real. Por eso se introduce `useCategories()`, una query real contra la tabla `categories` (ya permitida por `categories_select_all` para cualquier autenticado), con `staleTime: Infinity` dado que el catálogo es estático en este MVP.

## Query keys: introducción de la factory `taskKeys`

El sub-proyecto de feed+detalle dejó anotado como mejora diferida que las query keys planas (`['tasks','open']`, `['tasks', id]`) no eran ideales para invalidación masiva futura. Este sub-proyecto es la primera vez que existe una necesidad real de invalidación (crear tarea → refrescar el feed), así que se introduce ahora:

```ts
const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filter: string) => [...taskKeys.lists(), filter] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};
```

`useOpenTasks()` y `useTask(id)` (ya existentes) se migran a `taskKeys.list('open')` y `taskKeys.detail(id)` respectivamente. `useCreateTask()`'s `onSuccess` invalida `taskKeys.lists()`.

## Arquitectura

### Unidades (una responsabilidad clara cada una)

| Unidad | Qué hace | Depende de |
|---|---|---|
| `features/tasks/schemas.ts` | `postTaskSchema` (Zod): `category_id` (número, requerido), `title` (string, min 5), `description` (string, min 20), `budget_reference` (número positivo, opcional), `city` (string, min 1), `address_approx` (string, opcional) | zod |
| `features/tasks/hooks.ts` (modificado) | Añade `taskKeys` factory; `useCategories()` (query); `useCreateTask()` (mutation — internamente usa `useAuth()` para obtener `session.user.id` y se lo pasa a `createTask`; invalida `taskKeys.lists()` en éxito, sin necesidad de reconstruir la tarea completa ya que se navega al feed, que hace su propio fetch con el join completo). Migra `useOpenTasks`/`useTask` a usar `taskKeys` | api.ts, `@tanstack/react-query`, `useAuth` |
| `features/tasks/api.ts` (modificado) | Añade `fetchCategories()` (select simple sobre `categories`); `createTask(clientId, input)` — `api.ts` son funciones planas (no pueden usar hooks), así que recibe `clientId` explícito del llamador, mismo patrón que `saveProfile(userId, input)` en `features/auth/actions.ts`. `client_id` no tiene default en la BD (columna `not null` sin default), así que es obligatorio pasarlo. Inserta y devuelve la fila cruda — no necesita reconstruir `TaskWithRelations` completo | supabase |
| `components/tasks/PostTaskForm.tsx` | Formulario react-hook-form + `zodResolver(postTaskSchema)`, mismo patrón que `LoginForm`/`ProfileForm` (Controller por campo, `submitError` en catch, `Button` con `loading={formState.isSubmitting}`). El campo de categoría es un `Pressable` + `Modal` nativo de RN listando `useCategories()` | react-hook-form, `Modal` de RN, `useCategories` |
| `app/(tabs)/post-task.tsx` | Reemplaza el placeholder: envuelve `PostTaskForm`, wiring del `onSubmit` a `useCreateTask().mutateAsync`, navega a `/(tabs)` al éxito | `PostTaskForm`, `useCreateTask` |

**Flujo de datos:** el formulario nunca toca Supabase directamente — pasa por `createTask` (capa `api.ts`) vía la mutation. RLS es el perímetro real (`tasks_insert_own` ya impide que alguien inserte una tarea a nombre de otro usuario); el formulario solo valida forma/UX con Zod.

## Testing

Misma disciplina que en los sub-proyectos anteriores: TDD para lógica pura, componentes con mocks.

| Unidad | Tipo | Qué verifica |
|---|---|---|
| `schemas.test.ts` | puro (TDD) | `postTaskSchema` acepta válido completo y válido sin opcionales; rechaza título/descripción cortos, presupuesto ≤ 0, ciudad vacía |
| `hooks.test.tsx` (extiende) | hook (mockeado) | `useCategories()` expone `data` desde `fetchCategories` mockeada; `useCreateTask()` llama `createTask` mockeada y, en éxito, invalida `taskKeys.lists()` |
| `PostTaskForm.test.tsx` | componente | Bloquea envío y muestra errores con campos vacíos; con datos válidos llama `onSubmit` con el payload correcto; el modal de categoría (con `useCategories` mockeado) lista las opciones y al elegir una refleja la selección en el campo |

Diferido: `api.ts` sin test directo (mismo precedente que `fetchOpenTasks`/`fetchTaskById`) — verificación en vivo contra Supabase pendiente hasta que Docker esté disponible.

## Estructura de carpetas (archivos nuevos/modificados)

```
app/(tabs)/
  post-task.tsx           MODIFICADO: reemplaza el placeholder

features/tasks/
  schemas.ts               NUEVO
  hooks.ts                 MODIFICADO: taskKeys, useCategories, useCreateTask
  api.ts                    MODIFICADO: fetchCategories, createTask
  __tests__/
    schemas.test.ts         NUEVO
    hooks.test.tsx           MODIFICADO

components/tasks/
  PostTaskForm.tsx          NUEVO
  __tests__/
    PostTaskForm.test.tsx    NUEVO
```

## Próximos sub-proyectos del frontend (fuera de esta spec)

1. Ofertar + ver ofertas + aceptar oferta (RPC `accept_offer`) + tab "Mis tareas".
2. Perfil propio (ver/editar) y placeholder de reputación real.
3. Integración real de SMS y pruebas E2E.
4. Migrar tipos de `features/tasks` y `features/auth` a `supabase gen types` cuando el stack local esté disponible.
