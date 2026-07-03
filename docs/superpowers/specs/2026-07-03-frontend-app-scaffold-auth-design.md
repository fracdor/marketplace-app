# Frontend App — Scaffold + Autenticación + Onboarding (Diseño)

**Fecha:** 2026-07-03
**Estado:** Aprobado para pasar a plan de implementación
**Spec de referencia (núcleo MVP):** [2026-07-02-mvp-marketplace-design.md](2026-07-02-mvp-marketplace-design.md)

## Contexto y alcance

Primer sub-proyecto del frontend de la app móvil (React Native / Expo) del marketplace de servicios freelance para Colombia. Consume el backend Supabase ya implementado (esquema + RLS + `accept_offer()`, en `main`).

El frontend completo es demasiado para una sola spec, así que —igual que el backend— se decompone. **Este sub-proyecto cubre únicamente:**

- Scaffold de la app Expo (config, TypeScript, NativeWind, Expo Router).
- Cliente Supabase con sesión persistida.
- Autenticación: login y registro (email + contraseña).
- Verificación de teléfono por SMS OTP (flujo real detrás de un stub de desarrollo).
- Onboarding mínimo (nombre, ciudad, foto opcional).
- Shell de navegación completo con el **gate de auth**, con las pantallas de `(tabs)` como placeholders.

**Explícitamente fuera de alcance** (sub-proyectos siguientes, cada uno con su spec):

- Feed de tareas abiertas, publicar tarea, ofertar, aceptar oferta, perfil de terceros.
- Integración real de SMS (proveedor tipo Twilio) — hoy se usa un stub de dev.
- Pruebas end-to-end (Maestro/Detox) e integración en vivo contra Supabase.

## Restricciones conocidas

- **Docker/Supabase local está caído** (bug de entorno documentado). Bloquea las pruebas en vivo contra el backend, no el scaffolding ni los tests unitarios/de componente (que mockean el cliente Supabase). Las variables `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` usan placeholders de dev hasta que el stack local vuelva (`npx supabase start` imprime los valores reales).
- **No hay proveedor SMS configurado.** La verificación de teléfono se construye real, pero detrás de una abstracción `OtpService` cuya implementación de dev usa un código fijo. Se cambia a proveedor real después sin tocar la UI.

## Decisiones de stack

| Área | Decisión | Motivo |
|---|---|---|
| Framework | React Native + Expo (managed) | Definido en la spec núcleo; experiencia JS/TS del usuario |
| Navegación | Expo Router (grupos `(auth)` y `(tabs)`) | Estándar Expo; gate de auth vía layouts |
| Estilos | **NativeWind** (Tailwind para RN) + primitivos propios en `components/ui/` | Cercano al modelo Tailwind/shadcn; control total del look |
| Gradiente animado | `expo-linear-gradient` + **Moti/Reanimated** | Traducción nativa del look de gradiente animado (el equivalente RN de framer-motion) |
| Estado de sesión | React Context (`AuthProvider`) + cliente Supabase directo | Ligero y suficiente para auth/onboarding. TanStack Query se difiere al sub-proyecto del feed |
| Formularios | react-hook-form + Zod (resolver) | Validación declarativa; Zod compartible con reglas de negocio |
| Persistencia de sesión | Adapter de `expo-secure-store` para el storage del cliente Supabase | Keychain/Keystore nativo, no AsyncStorage plano |

### Enfoques de estado considerados

- **A — Context + cliente Supabase directo (elegido):** ligero, encaja con un slice sin listas de datos.
- **B — TanStack Query desde ya:** sobre-ingeniería para auth/onboarding; se adopta con el feed.
- **C — Zustand global:** innecesario; el estado de auth es simple.

## Arquitectura

Pantallas leen `session`/`profile` del `AuthProvider` y llaman a acciones (`signIn`, `signUp`, `verifyPhone`, `saveProfile`) que envuelven el cliente Supabase. **La RLS del backend es el perímetro de seguridad real**; la app solo maneja UX y estado de sesión.

### Unidades (una responsabilidad clara cada una)

| Unidad | Qué hace | Depende de |
|---|---|---|
| `lib/supabase.ts` | Crea el cliente Supabase con adapter SecureStore | `@supabase/supabase-js`, `expo-secure-store` |
| `lib/env.ts` | Lee y valida las variables `EXPO_PUBLIC_*` | expo env |
| `lib/utils.ts` | `cn()` (clsx + tailwind-merge) para NativeWind | clsx, tailwind-merge |
| `features/auth/AuthProvider.tsx` | Context con `session`, `profile`, `loading`; escucha `onAuthStateChange` | cliente Supabase |
| `features/auth/actions.ts` | `signIn` / `signUp` / `verifyPhone` / `saveProfile` | cliente Supabase, OtpService |
| `features/auth/OtpService.ts` | Interfaz de OTP + impl. dev-stub (código fijo) | — |
| `features/auth/schemas.ts` | Esquemas Zod (login, registro, teléfono, perfil) | zod |
| `features/auth/gate.ts` | `needsOnboarding(profile)` / `routeFor(session, profile)` — puro | — |
| `components/ui/*` | `GradientBackground`, `Button`, `Input`, `Card` (RN nativos) | NativeWind, expo-linear-gradient, Moti |
| `app/` | Rutas Expo Router + `_layout` raíz con el gate | AuthProvider |

## Navegación y gate de auth

El gate vive en `app/_layout.tsx` y re-evalúa en cada cambio de sesión (`onAuthStateChange`):

1. **App abre** → restaura sesión desde SecureStore (mientras carga: splash).
2. **¿Sesión válida?**
   - **No** → grupo `(auth)`: Login ⇄ Registro (email+contraseña, Zod) → verificación de email (Supabase Auth) → queda con sesión pero perfil incompleto.
   - **Sí** → **¿Onboarding completo?** (condición: `full_name` + `city` + `phone_verified`)
     - **No** → Verify-phone (OTP dev-stub) → Onboarding (nombre, ciudad, foto opcional).
     - **Sí** → grupo `(tabs)`.

El fondo de gradiente animado aplica a `(auth)` + onboarding; `(tabs)` usa fondo neutro. Logout regresa al inicio del gate. Las pantallas de `(tabs)` (feed, mis-tareas, publicar, perfil) son **placeholders** en este sub-proyecto.

**Nota sobre confirmación de email:** si el proyecto Supabase tiene "Confirm email" activado, `signUp` no crea sesión activa hasta que el usuario confirma; el gate muestra entonces un estado intermedio "revisa tu correo" en `(auth)`. En Supabase local (dev) el email se auto-confirma (o se lee vía Inbucket), así que la sesión existe de inmediato. El plan debe manejar ambos casos.

## Testing

Misma disciplina que el backend: lógica primero, TDD donde aporta. **Jest + React Native Testing Library**, con el cliente Supabase **mockeado** (la suite corre sin Docker).

| Unidad | Tipo | Qué verifica |
|---|---|---|
| `schemas.test.ts` | puro (TDD) | Zod acepta válidos / rechaza inválidos: email, largo de contraseña, formato de teléfono colombiano, nombre y ciudad requeridos |
| `gate.test.ts` | puro (TDD) | `needsOnboarding` / `routeFor` devuelven el destino correcto en cada combinación de sesión/perfil |
| `OtpService.test.ts` | puro (TDD) | El dev-stub "envía" código, verifica el fijo, rechaza el incorrecto |
| Tests de pantallas | componente | Login/registro/verify-phone/onboarding renderizan, muestran errores de Zod al enviar inválido, llaman a la acción correcta al enviar válido (Supabase mockeado) |

Diferido: E2E (Maestro/Detox) e integración en vivo contra Supabase (Docker caído + sin proveedor SMS).

## Estructura de carpetas

La app Expo se inicializa en la **raíz del repo** (mismo repo que el backend `supabase/` y `docs/`; no un monorepo aparte).

```
app.config.ts            Expo config (nombre/scheme provisional, plugins)
tsconfig.json            TypeScript + alias @/*
babel.config.js          NativeWind + plugin de Reanimated
metro.config.js          NativeWind
tailwind.config.js       tema: colores marca + paleta del gradiente
global.css               directivas Tailwind
.env.example             EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY (placeholders dev)
jest.config.js

app/
  _layout.tsx            raíz: AuthProvider + gate + tema
  index.tsx              entrada → delega en el gate
  (auth)/
    _layout.tsx          wrapper con GradientBackground
    login.tsx  register.tsx  verify-phone.tsx  onboarding.tsx
  (tabs)/
    _layout.tsx          barra de tabs
    index.tsx  my-tasks.tsx  post-task.tsx  profile.tsx   (placeholders)

features/auth/
  AuthProvider.tsx  useAuth.ts  actions.ts  OtpService.ts  schemas.ts  gate.ts
  __tests__/             schemas · gate · OtpService

components/ui/
  GradientBackground.tsx  Button.tsx  Input.tsx  Card.tsx
  __tests__/

lib/
  supabase.ts  env.ts  utils.ts
```

Nota: el nombre de display y el `scheme` de la app se fijan a un valor provisional en `app.config.ts` y se cambian en un solo lugar; no es un bloqueo para este sub-proyecto.

## Próximos sub-proyectos del frontend (fuera de esta spec)

1. Feed de tareas abiertas + detalle de tarea (introduce TanStack Query).
2. Publicar tarea (formulario categoría/título/descripción/presupuesto/ciudad).
3. Ofertar + ver ofertas + aceptar oferta (RPC `accept_offer`).
4. Perfil propio (ver/editar) y placeholder de reputación.
5. Integración real de SMS y pruebas E2E.
