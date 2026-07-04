# Frontend App — Feed + Detalle de Tarea (Diseño)

**Fecha:** 2026-07-04
**Estado:** Aprobado para pasar a plan de implementación
**Specs de referencia:** [2026-07-02-mvp-marketplace-design.md](2026-07-02-mvp-marketplace-design.md) · [2026-07-03-frontend-app-scaffold-auth-design.md](2026-07-03-frontend-app-scaffold-auth-design.md)

## Contexto y alcance

Segundo sub-proyecto del frontend, sobre el scaffold+auth ya fusionado a `main`. Cubre:

- Feed de tareas abiertas (lista cronológica, más recientes primero, sin filtros ni paginación).
- Detalle de tarea (solo lectura): categoría, título, ubicación, tiempo relativo, presupuesto de referencia, descripción, autor (nombre + avatar vía `profiles_public`).
- Introduce **TanStack Query** como capa de data-fetching, según lo marcado en la spec de scaffold+auth.

**Explícitamente fuera de alcance** (sub-proyectos siguientes):

- Publicar tarea (formulario de creación).
- Ofertar, ver ofertas, aceptar oferta (`accept_offer`).
- Tab "Mis tareas" — sin valor funcional hasta que publicar-tarea y aceptar-oferta existan (nadie tendría tareas propias o asignadas que mostrar). Se construye junto con esos sub-proyectos.
- Perfil editable, sistema de reviews real.
- Filtro por ciudad/categoría, búsqueda, paginación — diferido por YAGNI dado el volumen de datos esperado en el MVP.

**Botón "Ofertar":** presente en el detalle de tarea pero **deshabilitado** (placeholder visual, texto "Ofertar (próximamente)"). Cero lógica de ofertas en este sub-proyecto.

## Restricciones conocidas

- **Docker/Supabase local sigue caído.** Los tipos de `Task`/`Profile` se escriben a mano (mismo patrón que `features/auth/types.ts`), verificados contra las migraciones ya aplicadas en `supabase/migrations/`. Migrar a `supabase gen types typescript` queda anotado como mejora futura para cuando el stack local vuelva.
- Los tests mockean el cliente Supabase y el módulo `api.ts` — la suite corre sin Docker, igual que en scaffold+auth.

## Decisiones de stack

| Área | Decisión | Motivo |
|---|---|---|
| Data fetching | **TanStack Query** (`@tanstack/react-query`) | Cache, refetch, pull-to-refresh "gratis"; explícitamente marcado en la spec anterior para introducirse en este sub-proyecto |
| Capa de acceso a datos | Funciones delgadas en `features/tasks/api.ts` sobre el cliente Supabase | Mismo patrón que `features/auth/actions.ts` — sin lógica de negocio en los hooks |
| Tipos | Escritos a mano en `features/tasks/types.ts`, no generados | Docker caído bloquea `supabase gen types`; los tipos se verifican contra las migraciones existentes |

### Enfoques de data-fetching considerados

- **A — TanStack Query + capa delgada (elegido):** cache/refetch declarativo, encaja con el roadmap.
- **B — `useEffect`/`useState` manual (como `AuthProvider`):** contradice la spec anterior, pierde ergonomía de cache sin necesidad.
- **C — A + tipos generados vía `supabase gen types`:** ideal a futuro, bloqueado hoy por Docker caído.

## Arquitectura

RLS del backend (`tasks_select_visible`) ya garantiza que un `select` sin filtro adicional solo devuelve tareas `status = 'open'` (o las propias del usuario) — el feed no filtra por status en el cliente, confía en RLS como perímetro.

### Unidades (una responsabilidad clara cada una)

| Unidad | Qué hace | Depende de |
|---|---|---|
| `features/tasks/types.ts` | `Task` (fila cruda de `public.tasks`) y `TaskWithRelations` (= `Task` + `category: { name, slug }` + `client: { full_name, avatar_url }` desde `profiles_public`) — `api.ts`/`hooks.ts` siempre devuelven `TaskWithRelations`, `Task` es la base | — |
| `features/tasks/api.ts` | `fetchOpenTasks()`, `fetchTaskById(id)` — `select` de Supabase con joins anidados a `categories` y `profiles_public` | cliente Supabase |
| `features/tasks/hooks.ts` | `useOpenTasks()`, `useTask(id)` — envuelven `useQuery` | `api.ts` |
| `features/tasks/format.ts` | `formatBudget(n)`, `formatRelativeTime(date)` — funciones puras, TDD | — |
| `components/tasks/TaskCard.tsx` | Tarjeta compacta del feed (Opción A validada): categoría (badge), título, ciudad + tiempo relativo, presupuesto, autor abreviado, placeholder de reputación. Recibe `onPress` — no navega por sí misma (mantiene el componente puro/testeable) | `cn`, `format.ts` |
| `app/(tabs)/index.tsx` | Reemplaza el placeholder — `FlatList` de `useOpenTasks()`, pull-to-refresh, estados vacío/carga/error. Cada `TaskCard` recibe `onPress={() => router.push(`/task/${item.id}`)}` | `TaskCard`, `hooks.ts` |
| `app/task/[id].tsx` | Pantalla de detalle (ruta dinámica fuera de `(tabs)`, header nativo con back) — layout "bloques apilados" (Opción A validada) | `useTask(id)` |
| `app/_layout.tsx` | Modificado: envuelve el árbol en `QueryClientProvider`, anidado junto al `AuthProvider` ya existente | `@tanstack/react-query` |

## Diseño visual (validado con mockups)

**Tarjeta de tarea (feed) — "Compacta":** fila densa con badge de categoría (teal, esquina superior) y placeholder de reputación (★, arriba derecha), título en negrita, ciudad + tiempo relativo debajo, y una línea inferior separada por borde con presupuesto (izquierda, acento teal) y nombre abreviado del autor (derecha).

**Detalle de tarea — "Bloques apilados":** header teal con back button y título "Detalle de tarea"; badge de categoría; título grande; línea de ubicación/tiempo/reputación; bloque de presupuesto en tarjeta gris; sección "Descripción"; sección "Publicado por" con avatar + nombre; botón "Ofertar" deshabilitado, fijo (sticky) al pie de la pantalla.

Ambas pantallas reservan espacio visual para reputación/rating (placeholder, sin datos reales) — nota de UX ya establecida en la spec del MVP.

## Testing

Misma disciplina que scaffold+auth: lógica pura primero (TDD), componentes con mocks después. Cliente Supabase y `api.ts` mockeados — suite corre sin Docker.

| Unidad | Tipo | Qué verifica |
|---|---|---|
| `format.test.ts` | puro (TDD) | `formatBudget` formatea COP con/sin presupuesto nulo; `formatRelativeTime` produce "hace X horas/días" para distintos deltas |
| `TaskCard.test.tsx` | componente | Renderiza título, badge de categoría, ciudad, presupuesto formateado, placeholder de reputación |
| `hooks.test.tsx` | componente (hook) | `useOpenTasks`/`useTask` envueltos en un `QueryClientProvider` de prueba, con `api.ts` mockeado — exponen `data`/`isLoading`/`error` correctamente |
| Pantalla de detalle | componente (mockeado) | Renderiza los campos de la tarea vía `useTask` mockeado; botón "Ofertar" deshabilitado; estados de carga/error |

Diferido: integración en vivo contra Supabase (Docker caído) — cubierto indirectamente por la suite pgTAP del backend, que ya verifica `tasks_select_visible` con casos negativos.

## Estructura de carpetas (nuevos archivos)

```
app/
  task/
    [id].tsx              detalle de tarea (ruta dinámica, fuera de (tabs))
  (tabs)/
    index.tsx             MODIFICADO: reemplaza el placeholder del feed

features/tasks/
  types.ts
  api.ts
  hooks.ts
  format.ts
  __tests__/
    format.test.ts
    hooks.test.tsx

components/tasks/
  TaskCard.tsx
  __tests__/
    TaskCard.test.tsx
```

## Próximos sub-proyectos del frontend (fuera de esta spec)

1. Publicar tarea (formulario categoría/título/descripción/presupuesto/ciudad).
2. Ofertar + ver ofertas + aceptar oferta (RPC `accept_offer`) + tab "Mis tareas".
3. Perfil propio (ver/editar) y placeholder de reputación real.
4. Integración real de SMS y pruebas E2E (heredado de scaffold+auth).
5. Migrar tipos de `features/tasks` y `features/auth` a `supabase gen types` cuando el stack local esté disponible.
