# Frontend App — Cancelar Tarea Abierta (Diseño)

**Fecha:** 2026-07-09
**Estado:** Aprobado para pasar a plan de implementación
**Specs de referencia:** [2026-07-02-mvp-marketplace-design.md](2026-07-02-mvp-marketplace-design.md) · [2026-07-09-frontend-offers-mytasks-design.md](2026-07-09-frontend-offers-mytasks-design.md)

## Contexto y alcance

Séptimo sub-proyecto del frontend, sobre ofertas/mis-tareas y perfil-propio ya fusionados a `main`. El backend ya tiene dos mecanismos construidos para "deshacer" una tarea abierta:

1. El trigger `enforce_task_status_transitions` (`supabase/migrations/20260702000003_create_tasks.sql`) ya permite la transición `open → cancelled` vía un `UPDATE` normal, protegido por la RLS `tasks_update_own` existente.
2. La política RLS `tasks_delete_own_open` permite un `DELETE` mientras `status = 'open'`.

Este sub-proyecto usa **el primero** (cambio de estado, no borrado): la UI ya tiene hueco anticipado para un estado `'cancelled'` — tanto `PublishedTaskRow.statusLine` como `TaskActionZone` ya renderizan ese caso (`'Cancelada'` / `'Tarea cancelada.'`), simplemente nunca hay forma de llegar ahí desde la app todavía.

Cubre:

- Cancelar una tarea `open` (dueño únicamente): `UPDATE tasks SET status = 'cancelled'` — sin RPC nueva, mismo patrón que `completeTask`.
- Botón "Cancelar tarea" en **dos lugares**: el detalle de la tarea (`TaskActionZone`, visible al dueño mientras esté `open`, con o sin ofertas recibidas) y la fila de "Mis tareas > Publicadas" (`PublishedTaskRow`, acción inline sin entrar al detalle).
- Confirmación nativa (`Alert.alert`) antes de ejecutar — mensaje distinto si la tarea tiene ofertas pendientes ("se cancelarán también las N ofertas recibidas") vs. si no las tiene.
- **Ofertas huérfanas:** cancelar una tarea con ofertas pendientes NO transiciona esas ofertas (quedan `status = 'pending'` en la base de datos indefinidamente — fuera de alcance tocar el esquema de `offers`). `MyOfferRow` (vista del freelancer en "Trabajos") se actualiza para detectar esta situación del lado de la lectura: si `offer.status === 'pending'` pero `offer.task?.status === 'cancelled'`, muestra "Tarea cancelada" en vez de "Pendiente" y oculta el botón "Retirar oferta".

**Explícitamente fuera de alcance:**

- Borrado permanente (`tasks_delete_own_open` existe pero no se usa aquí — se prefiere preservar historial, igual que `completed`).
- Cualquier transición de salida de `'cancelled'` — el trigger no la define, es irreversible por diseño. No hay botón de "reabrir".
- Notificar activamente a los freelancers cuya oferta quedó huérfana (push, email, etc.) — se enteran pasivamente la próxima vez que abren "Mis tareas > Trabajos" en su propio dispositivo.
- Cancelar una tarea `assigned` (ya tiene un freelancer trabajando) — el trigger no permite esa transición; solo `open → cancelled`.

## Arquitectura

### Cambios en la capa de datos

| Unidad | Qué hace |
|---|---|
| `features/tasks/api.ts` +`cancelTask(taskId)` | `update({ status: 'cancelled' }).eq('id', taskId)` — espejo exacto de `completeTask`, ningún RPC nuevo |
| `features/tasks/hooks.ts` +`useCancelTask()` | Mutation que llama `cancelTask`, invalida `taskKeys.detail(taskId)` + `taskKeys.lists()` en éxito. A diferencia de `useCompleteTask` (que solo invalida `list('mine')`, porque una tarea completada nunca estuvo en el feed abierto), cancelar SÍ saca la tarea del feed — `taskKeys.lists()` ya cubre `list('open')` y `list('mine')` con un solo prefix-match, mismo patrón ya usado por `useAcceptOffer` |

Sin invalidación cruzada de `offerKeys`: el freelancer que ofertó ve el nuevo estado la próxima vez que abre su propia app — es una caché de otro dispositivo, no hay nada que invalidar desde el lado del cliente que cancela.

### Cambios en componentes

| Componente | Cambio |
|---|---|
| `components/tasks/PublishedTaskRow.tsx` | Gana `onCancel: () => void` y `cancelling: boolean` (props requeridas, único consumidor). Se reestructura: en vez de que toda la fila sea un `Pressable`, pasa a ser un `View` con un `Pressable` interno para navegar (título + `statusLine`) y, si `task.status === 'open'`, un botón "Cancelar" separado debajo — mismo patrón que `MyOfferRow` ya usa (`View` + botón condicional), evita anidar `Pressable`s (el bug ya resuelto en el sub-proyecto de publicar-tarea) |
| `components/tasks/TaskActionZone.tsx` | Gana `cancelling: boolean` + `onCancel: () => void`. Los casos A y B del dueño (`status === 'open'`, con o sin ofertas) ahora también muestran un botón "Cancelar tarea" debajo del contenido existente |
| `components/offers/MyOfferRow.tsx` | Si `offer.status === 'pending'` y `offer.task?.status === 'cancelled'`, la línea de estado (`{formatBudget(price)} · {STATUS_LABEL[status]}`) sustituye únicamente la parte de la etiqueta por "Tarea cancelada" (ej. `$85.000 · Tarea cancelada`, mismo formato de precio+separador que ya existe), y no renderiza el botón "Retirar oferta" |

### Cambios en pantallas

| Pantalla | Cambio |
|---|---|
| `app/task/[id].tsx` | Nuevo `handleCancel` con `Alert.alert` de confirmación (mensaje varía según `offers.length`), llama `useCancelTask().mutateAsync(id)` dentro de try/catch con el mismo patrón de `actionError` ya establecido |
| `app/(tabs)/my-tasks.tsx` | `PublishedTasksList` gana la misma lógica de confirmación (mensaje varía según `task.offer_count`, ya disponible en `MyPublishedTask`) y wiring de `useCancelTask` para el botón inline de `PublishedTaskRow` |

## Testing

| Unidad | Qué verifica |
|---|---|
| `features/tasks/__tests__/hooks.test.tsx` (extiende) | `useCancelTask` llama `cancelTask` con el id correcto e invalida `taskKeys.detail`/`taskKeys.lists()` |
| `components/offers/__tests__/MyOfferRow.test.tsx` (extiende) | oferta `pending` + tarea `cancelled` → muestra "Tarea cancelada", oculta "Retirar oferta" |
| `components/tasks/__tests__/TaskActionZone.test.tsx` (extiende) | dueño+abierta (con y sin ofertas) muestra "Cancelar tarea"; presionarlo llama `onCancel` |
| `components/tasks/__tests__/PublishedTaskRow.test.tsx` (extiende) | botón "Cancelar" visible solo si `status === 'open'`; presionarlo llama `onCancel`; deshabilitado si `cancelling` |
| `app/task/__tests__/task-detail.test.tsx` (extiende) | confirmación antes de cancelar; el mensaje varía según si hay ofertas |
| `app/(tabs)/__tests__/my-tasks.test.tsx` (extiende) | cancelar desde la fila de Publicadas pide confirmación y llama la mutación |

Diferido: `cancelTask` en `api.ts` sin test directo — mismo precedente que `completeTask`/`fetchOpenTasks` (correctitud descansa en el trigger + RLS ya documentados, verificación en vivo pendiente hasta que Docker esté disponible).

## Estructura de carpetas (archivos modificados, ninguno nuevo)

```
app/task/[id].tsx                          MODIFICADO
app/(tabs)/my-tasks.tsx                    MODIFICADO
components/tasks/TaskActionZone.tsx        MODIFICADO
components/tasks/PublishedTaskRow.tsx      MODIFICADO
components/offers/MyOfferRow.tsx           MODIFICADO
features/tasks/api.ts                       MODIFICADO
features/tasks/hooks.ts                     MODIFICADO
```

## Próximos sub-proyectos del frontend (fuera de esta spec)

1. Integración real de SMS y pruebas E2E (requiere Docker/Supabase local, actualmente caído en esta máquina).
2. Migrar tipos de `features/tasks`, `features/offers` y `features/auth` a `supabase gen types` (mismo requisito de Docker).
