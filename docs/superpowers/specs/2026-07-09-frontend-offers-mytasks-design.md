# Frontend App — Ofertar, Aceptar Oferta, Completar Tarea y "Mis Tareas" (Diseño)

**Fecha:** 2026-07-09
**Estado:** Aprobado para pasar a plan de implementación
**Specs de referencia:** [2026-07-02-mvp-marketplace-design.md](2026-07-02-mvp-marketplace-design.md) · [2026-07-03-frontend-app-scaffold-auth-design.md](2026-07-03-frontend-app-scaffold-auth-design.md) · [2026-07-04-frontend-feed-task-detail-design.md](2026-07-04-frontend-feed-task-detail-design.md) · [2026-07-04-frontend-post-task-design.md](2026-07-04-frontend-post-task-design.md)

## Contexto y alcance

Quinto sub-proyecto del frontend, sobre el scaffold+auth, feed+detalle y publicar-tarea ya fusionados a `main`. El backend ya tiene todo lo necesario: tabla `offers` con sus políticas RLS (`offers_select_related`, `offers_insert_own`, `offers_withdraw_own`) y la función `accept_offer(offer_id)` (`SECURITY DEFINER`), todo del sub-proyecto de backend. Este sub-proyecto cierra el ciclo completo de una tarea: **abrir → recibir ofertas → aceptar una → completar**.

Cubre:

- Formulario de ofertar (`offer/create.tsx`): precio + mensaje opcional, inserta en `offers`.
- Detalle de tarea (`task/[id].tsx`, modificado): la zona inferior fija ("Ofertar (próximamente)") se reemplaza por contenido dinámico según rol (dueño/freelancer) y estado — ver la sección "Los casos" más abajo.
- Retirar una oferta propia mientras esté `pending`.
- Aceptar una oferta (RPC `accept_offer`), con diálogo de confirmación nativo antes de ejecutar (acción irreversible: rechaza todas las demás ofertas de la tarea).
- Marcar una tarea `assigned` como `completed` — **no requiere una función RPC nueva**: el trigger `enforce_task_status_transitions` ya permite esta transición vía `UPDATE` normal, protegido por la RLS existente `tasks_update_own`.
- Tab "Mis tareas" (reemplaza el placeholder): dos sub-tabs locales (no rutas separadas) — **Publicadas** (mis tareas como cliente, todos los estados) y **Trabajos** (todas mis ofertas como freelancer, con su estado — no solo las que gané).

**Explícitamente fuera de alcance** (sub-proyectos siguientes):

- Cancelar una tarea abierta (el trigger ya lo permite a nivel de base de datos, pero no hay UI para ello en este sub-proyecto).
- Editar una oferta ya enviada — el backend no lo soporta (`offers_withdraw_own` solo permite `pending → withdrawn`, y `unique(task_id, freelancer_id)` impide volver a ofertar en la misma tarea tras retirar). Este es un límite real del backend ya fusionado, no algo que este sub-proyecto pueda o deba resolver.
- Notificaciones push o actualizaciones en tiempo real (Supabase Realtime). Se sigue el patrón ya establecido: refetch al entrar a la pantalla vía TanStack Query, sin suscripciones live.
- Sistema de reputación/reviews real (sigue como placeholder visual, ya presente en el detalle de tarea: "★ nuevo").

## Los casos de la zona inferior del detalle de tarea

**Corrección respecto a la ronda de mockups:** el catálogo visual mostrado durante el brainstorming tenía 7 casos, pero al trazar la política RLS `tasks_select_visible` (`status = 'open' OR client_id = auth.uid() OR assigned_freelancer_id = auth.uid()`) con cuidado, uno de esos 7 casos resulta **irrealizable** (si la tarea no está abierta y el usuario no es dueño ni el freelancer asignado, RLS bloquea la fila completa — `fetchTaskById` devuelve `null` y la pantalla ya maneja eso con su rama `isError || !task` existente, nunca llega a la zona dinámica) y faltaban **3 casos reales**: dueño viendo su tarea ya completada, freelancer ganador viendo la tarea mientras trabaja, y freelancer viendo su trabajo ya completado. El catálogo correcto, derivado de enumerar todas las combinaciones alcanzables de (relación del usuario con la tarea) × (estado), es:

Determinado comparando `session.user.id` contra `task.client_id`/`task.assigned_freelancer_id`, y el resultado de `useOffersForTask(id)` (consultado siempre, sin importar el estado de la tarea — además de revelar si el freelancer actual ya tiene una oferta, es la fuente para obtener el nombre del freelancer ganador en los casos C/D vía el registro con `status: 'accepted'`):

| Caso | Condición | Contenido |
|---|---|---|
| A | Dueño, `open`, sin ofertas | "Aún no has recibido ofertas para esta tarea." |
| B | Dueño, `open`, con ofertas | Lista de ofertas (`OfferListItem`: nombre, precio, mensaje, botón "Aceptar") |
| C | Dueño, `assigned` | "Asignada a {nombre}" (del offer `accepted`) + botón "Marcar como completada" |
| D | Dueño, `completed` | "Tarea completada" + nombre del freelancer (informativo, sin acción) |
| E | Soy el freelancer asignado, `assigned` | "Te asignaron esta tarea. Contacta al cliente para coordinar." (informativo, sin acción — solo el cliente marca completada) |
| F | Soy el freelancer asignado, `completed` | "Trabajo completado." (informativo) |
| G | No soy dueño ni asignado, `open`, sin oferta propia | Botón "Ofertar" (navega a `offer/create.tsx`) |
| H | No soy dueño ni asignado, `open`, mi oferta está `pending` | "Ya ofertaste ${precio} · Pendiente" + botón "Retirar oferta" |
| I | No soy dueño ni asignado, `open`, mi oferta está `withdrawn`/`rejected` | "Ya no puedes ofertar en esta tarea." |
| J (salvaguarda) | Dueño, `cancelled` | "Tarea cancelada." — estado alcanzable solo por manipulación directa de datos hoy (no hay UI de cancelar en este sub-proyecto), pero el trigger lo permite a nivel de base de datos; se cubre para no dejar un caso sin renderizar |

Nada de esto se reimplementa como regla de negocio en el cliente — es únicamente *routing* de UI sobre datos que ya llegan filtrados/validados por RLS y el trigger. El caso "tarea cerrada y no soy dueño ni asignado" del catálogo visual original **no se implementa** porque, confirmado arriba, es inalcanzable: ya está cubierto por la rama de error genérica existente de `task/[id].tsx`.

## Arquitectura

### `features/offers/` (nuevo, mismo patrón que `features/tasks/`)

| Archivo | Contenido |
|---|---|
| `types.ts` | `OfferStatus` (`'pending'\|'accepted'\|'rejected'\|'withdrawn'`), `Offer` (fila cruda), `OfferWithFreelancer` (oferta + `full_name`/`avatar_url` del freelancer — vista del dueño de la tarea), `MyOfferWithTask` (oferta + `title`/`status`/`city` de la tarea — vista "Trabajos"), `CreateOfferInput` |
| `schemas.ts` | `createOfferSchema` (Zod): `price` (string numérico, `.trim()`, positivo — mismo patrón que `budget_reference` en `postTaskSchema`), `message` (string, opcional) |
| `api.ts` | `fetchOffersForTask(taskId)`, `fetchMyOffers(freelancerId)`, `createOffer(freelancerId, input)`, `withdrawOffer(offerId)`, `acceptOffer(offerId)` (vía `supabase.rpc('accept_offer', { p_offer_id: offerId })`) |
| `hooks.ts` | `offerKeys` factory (`all` → `forTask(taskId)` / `mine()`), `useOffersForTask(taskId)`, `useMyOffers()`, `useCreateOffer()`, `useWithdrawOffer()`, `useAcceptOffer()` |

`fetchOffersForTask`/`fetchMyOffers` unen `offers` con `profiles_public` (freelancer) o con `tasks` (para "Trabajos") — mismo patrón de segunda-query-y-join-client-side que `attachClients` en `features/tasks/api.ts`, por la misma razón (vistas/RLS no permiten embeds directos de forma segura entre estas tablas).

### `features/tasks/` (extiende lo existente)

| Cambio | Contenido |
|---|---|
| `api.ts` +`fetchMyTasks(clientId)` | Tareas donde `client_id = clientId`, todos los estados. Para las `open`: conteo de ofertas (query agrupada `select task_id, count(*) from offers where task_id in (...) group by task_id`, mergeada client-side). Para las `assigned`/`completed`: nombre del freelancer ganador (join contra `offers` filtrando `status = 'accepted'` + `profiles_public`, mismo patrón de segunda-query que `attachClients`) |
| `api.ts` +`completeTask(taskId)` | `update tasks set status = 'completed' where id = taskId` — sin RPC, el trigger ya valida `assigned → completed` |
| `hooks.ts` +`taskKeys.list('mine')`, `useMyTasks()`, `useCompleteTask()` | Sigue la factory ya existente |

### Componentes nuevos

| Componente | Uso |
|---|---|
| `components/offers/OfferForm.tsx` | react-hook-form + `zodResolver(createOfferSchema)`, mismo patrón que `PostTaskForm`/`LoginForm` (2 campos: precio, mensaje) |
| `components/offers/OfferListItem.tsx` | Fila de oferta recibida — vista del dueño (caso 2), con botón "Aceptar" |
| `components/offers/MyOfferRow.tsx` | Fila en "Trabajos" — tarea + precio ofertado + estado + botón "Retirar oferta" si `pending` |
| `components/tasks/PublishedTaskRow.tsx` | Fila en "Publicadas" — tarea + estado + conteo de ofertas (abierta) o freelancer asignado (asignada/completada) |

### Pantallas modificadas/nuevas

| Pantalla | Cambio |
|---|---|
| `app/task/[id].tsx` (modificado) | Reemplaza el bloque fijo "Ofertar (próximamente)" por los 7 casos. "Aceptar" dispara `Alert.alert` de confirmación nativo (RN) antes de `useAcceptOffer().mutateAsync` |
| `app/offer/create.tsx` (nuevo) | `OfferForm` + `useCreateOffer().mutateAsync`, `router.back()` al éxito (vuelve al detalle de la tarea, que refetch por invalidación) |
| `app/(tabs)/my-tasks.tsx` (reemplaza el placeholder) | Sub-tabs locales "Publicadas"/"Trabajos" (`useState`, no rutas), cada uno con su lista propia |

**Flujo de datos:** igual que en sub-proyectos anteriores — el cliente nunca reimplementa reglas de negocio; RLS y el trigger/función `accept_offer` son el perímetro real. El formulario y las pantallas solo validan forma/UX (Zod) y hacen *routing* de estado (los casos de la tabla anterior).

## Invalidación de caché (TanStack Query)

| Acción | Invalida |
|---|---|
| Crear oferta | `offerKeys.forTask(taskId)`, `offerKeys.mine()` |
| Retirar oferta | `offerKeys.forTask(taskId)`, `offerKeys.mine()` |
| Aceptar oferta | `offerKeys.forTask(taskId)`, `taskKeys.detail(taskId)`, `taskKeys.lists()` (la tarea sale del feed abierto y cambia de estado en "Publicadas") |
| Completar tarea | `taskKeys.detail(taskId)`, `taskKeys.list('mine')` |

## Manejo de errores

Mismo patrón ya establecido: `mapAuthError` (de `features/auth/errors.ts`) como fallback genérico de Supabase-error-a-español en cada mutación (`createOffer`, `withdrawOffer`, `acceptOffer`, `completeTask`), mensaje mostrado inline en la pantalla correspondiente — sin toasts nuevos.

## Testing

Misma disciplina TDD que en sub-proyectos anteriores: lógica pura con TDD, componentes con mocks de hooks/API.

| Unidad | Tipo | Qué verifica |
|---|---|---|
| `features/offers/schemas.test.ts` | puro (TDD) | `createOfferSchema` acepta precio válido con/sin mensaje; rechaza precio ≤ 0, no numérico, o vacío |
| `features/offers/hooks.test.tsx` | hook (mockeado) | `useOffersForTask`/`useMyOffers` exponen datos de la API mockeada; `useCreateOffer`/`useWithdrawOffer`/`useAcceptOffer` llaman a la función correcta e invalidan las keys correctas |
| `features/tasks/hooks.test.tsx` (extiende) | hook (mockeado) | `useMyTasks()` expone datos; `useCompleteTask()` llama `completeTask` e invalida `taskKeys.detail`/`taskKeys.list('mine')` |
| `OfferForm.test.tsx` | componente | Bloquea envío con precio inválido; con datos válidos llama `onSubmit` con el payload convertido |
| `task/[id].test.tsx` (nuevo o extiende el existente) | componente | Cada uno de los casos renderiza el contenido correcto según los mocks de sesión/tarea/ofertas provistos; "Aceptar" dispara el diálogo de confirmación antes de llamar la mutación |
| `my-tasks.test.tsx` | componente | Cambiar de sub-tab muestra la lista correspondiente; cada fila muestra el estado/conteo esperado |

Diferido: `api.ts` sin test directo para las funciones de solo-lectura/escritura simple (mismo precedente que `fetchOpenTasks`/`createTask`) — verificación en vivo contra Supabase pendiente hasta que Docker esté disponible ([[docker-inference-socket-crash]]). La función RPC `accept_offer` en sí ya tiene su propia cobertura pgTAP del lado del backend (incluyendo el caso de concurrencia) — este sub-proyecto solo verifica que el cliente la invoque correctamente vía mock.

## Estructura de carpetas (archivos nuevos/modificados)

```
app/
  task/[id].tsx              MODIFICADO: zona inferior dinámica (casos A-J)
  offer/create.tsx           NUEVO
  (tabs)/my-tasks.tsx        MODIFICADO: reemplaza el placeholder

features/offers/
  types.ts                    NUEVO
  schemas.ts                  NUEVO
  api.ts                      NUEVO
  hooks.ts                    NUEVO
  __tests__/
    schemas.test.ts           NUEVO
    hooks.test.tsx             NUEVO

features/tasks/
  api.ts                       MODIFICADO: fetchMyTasks, completeTask
  hooks.ts                     MODIFICADO: taskKeys.list('mine'), useMyTasks, useCompleteTask
  __tests__/
    hooks.test.tsx              MODIFICADO

components/offers/
  OfferForm.tsx                NUEVO
  OfferListItem.tsx            NUEVO
  MyOfferRow.tsx                NUEVO
  __tests__/
    OfferForm.test.tsx          NUEVO

components/tasks/
  PublishedTaskRow.tsx          NUEVO
```

## Próximos sub-proyectos del frontend (fuera de esta spec)

1. Perfil propio (ver/editar) y placeholder de reputación real.
2. Integración real de SMS y pruebas E2E.
3. Cancelar tarea abierta.
4. Migrar tipos de `features/tasks`, `features/offers` y `features/auth` a `supabase gen types` cuando el stack local esté disponible.
