# Frontend App — Perfil Propio (Diseño)

**Fecha:** 2026-07-09
**Estado:** Aprobado para pasar a plan de implementación
**Specs de referencia:** [2026-07-02-mvp-marketplace-design.md](2026-07-02-mvp-marketplace-design.md) · [2026-07-03-frontend-app-scaffold-auth-design.md](2026-07-03-frontend-app-scaffold-auth-design.md) · [2026-07-09-frontend-offers-mytasks-design.md](2026-07-09-frontend-offers-mytasks-design.md)

## Contexto y alcance

Sexto sub-proyecto del frontend, sobre el scaffold+auth, feed+detalle, publicar-tarea, y ofertas/mis-tareas ya fusionados a `main`. Reemplaza el placeholder `(tabs)/profile.tsx` (que hoy solo tiene un botón "Cerrar sesión") por la pantalla real de ver/editar el perfil propio.

Gran parte de la infraestructura de datos ya existe, de los sub-proyectos de scaffold+auth (onboarding usa este mismo flujo para capturar nombre/ciudad la primera vez):

- `Profile` (tipo, `features/auth/types.ts`): `id`, `full_name`, `city`, `phone`, `phone_verified`, `avatar_url`.
- `saveProfile(userId, input)` y `fetchProfile(userId)` (`features/auth/actions.ts`) — ya existen, sin cambios.
- `ProfileForm` (`features/auth/ProfileForm.tsx`) — formulario nombre+ciudad ya construido y probado, reutilizado de onboarding, con una pequeña extensión (ver Arquitectura).
- `useAuth()` ya expone `{ session, profile, refreshProfile }` vía `AuthProvider` — la fuente de datos del perfil actual.

**Invariante que simplifica el modo vista:** `features/auth/gate.ts`'s `needsOnboarding()` ya garantiza que ningún usuario llega a `(tabs)` (y por lo tanto a esta pantalla) sin `phone_verified === true`, `full_name` no vacío, y `city` no vacía — el gate de la app redirige a onboarding en cualquier otro caso. Esto significa que el modo vista de esta pantalla **no necesita manejar estados de "sin teléfono", "nombre vacío" o "no verificado"** — esos casos son inalcanzables una vez dentro de `(tabs)`, no requieren fallback defensivo.

Cubre:

- Pantalla de perfil con dos modos, alternados con estado local (`mode: 'view' | 'edit'`), **sin ruta nueva** (toggle inline, no una pantalla de edición aparte):
  - **Modo vista:** avatar placeholder circular, nombre, ciudad, badge de reputación placeholder ("★ nuevo", mismo texto ya usado en el feed y detalle de tarea), teléfono con indicador de verificado, botón "Editar perfil".
  - **Modo edición:** `ProfileForm` prellenado con los valores actuales, botones "Guardar" y "Cancelar".
- Guardar cambios: `saveProfile(userId, input)` → `refreshProfile()` (para que el contexto de auth se actualice sin recargar la app) → vuelve a modo vista.
- Cancelar: vuelve a modo vista sin persistir nada.
- El botón "Cerrar sesión" existente se mantiene igual.

**Explícitamente fuera de alcance** (sub-proyectos futuros o nunca, según corresponda):

- Editar el número de teléfono desde esta pantalla — requeriría reabrir el flujo OTP (`OtpService`/`verify-phone`), que hoy solo se usa durante onboarding. Alcance separado si se decide agregarlo.
- Subir o cambiar el avatar — requiere integrar Supabase Storage, que no está conectado en ningún punto de la app todavía. Mismo patrón de "fotos diferidas" ya usado en los sub-proyectos de publicar-tarea y ofertas.
- Sistema de reputación real — sigue como placeholder visual, consistente con el resto de la app.

## Arquitectura

### Cambios

| Unidad | Qué hace | Depende de |
|---|---|---|
| `features/auth/ProfileForm.tsx` (modificado) | Gana una prop opcional `initialValues?: { full_name: string; city: string }`, usada como `defaultValues` de `useForm` si se pasa; si no se pasa, sigue usando `{ full_name: '', city: '' }` como hoy (onboarding no se ve afectado) | react-hook-form (sin cambios en su lógica interna) |
| `app/(tabs)/profile.tsx` (reescrito) | Reemplaza el placeholder. Lee `{ profile, session, refreshProfile }` de `useAuth()`. Estado local `mode`. En modo vista renderiza los datos de `profile`; en modo edición renderiza `ProfileForm` con `initialValues={{ full_name: profile.full_name ?? '', city: profile.city ?? '' }}` y `onSubmit` que llama `saveProfile` + `refreshProfile` + vuelve a `'view'`. Mantiene el botón "Cerrar sesión" existente | `useAuth`, `saveProfile` (`features/auth/actions.ts`), `ProfileForm` |

No se crean tablas, RPCs, hooks de TanStack Query, ni rutas nuevas — todo el backend y el estado de auth ya existen.

### Flujo de datos

```
Modo vista → tap "Editar perfil" → Modo edición (ProfileForm prellenado)
Modo edición → tap "Cancelar" → Modo vista (sin persistir)
Modo edición → tap "Guardar" → saveProfile(userId, input) → refreshProfile() → Modo vista (datos actualizados)
```

`ProfileForm` ya maneja su propio `submitError` internamente (try/catch alrededor del `onSubmit` prop, patrón ya establecido en `PostTaskForm`/`OfferForm`) — la pantalla no necesita manejo de errores adicional, solo pasar la función de guardado como `onSubmit`.

## Testing

| Unidad | Tipo | Qué verifica |
|---|---|---|
| `ProfileForm.test.tsx` (extiende) | componente | con `initialValues`, los campos se prellenan con esos valores al montar; sin la prop, el comportamiento existente (campos vacíos) no cambia |
| `profile.test.tsx` (nuevo) | pantalla | modo vista muestra nombre/ciudad/teléfono/badge verificado/★ nuevo; tocar "Editar perfil" muestra el formulario prellenado con los valores actuales; guardar llama `saveProfile` con los valores correctos y `refreshProfile`, y vuelve a modo vista; "Cancelar" vuelve a modo vista sin llamar `saveProfile`; "Cerrar sesión" sigue funcionando igual que hoy |

## Estructura de carpetas (archivos nuevos/modificados)

```
app/(tabs)/
  profile.tsx                REESCRITO: reemplaza el placeholder
  __tests__/
    profile.test.tsx          NUEVO

features/auth/
  ProfileForm.tsx              MODIFICADO: +initialValues opcional
  __tests__/
    ProfileForm.test.tsx        MODIFICADO: +casos de initialValues
```

## Próximos sub-proyectos del frontend (fuera de esta spec)

1. Integración real de SMS y pruebas E2E.
2. Cancelar tarea abierta.
3. Migrar tipos de `features/tasks`, `features/offers` y `features/auth` a `supabase gen types` cuando el stack local esté disponible.
4. Cambiar teléfono desde el perfil (si se decide más adelante).
5. Subida de avatar (requiere integrar Supabase Storage).
