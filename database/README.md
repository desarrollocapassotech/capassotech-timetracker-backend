# Modelo de datos — Neon (Postgres)

Diseño relacional que reemplaza las colecciones de Firestore (`users`, `colaboradores`,
`clients`, `projects`, `timeEntries`). Todo vive en un único schema: **`tracker`**.

DDL completo: [`schema.sql`](./schema.sql). Ya aplicado contra Neon (ver estado abajo).

## Proyecto Neon

- **Cuenta dedicada, separada de la organización compartida con colaboradores**
  (la primera versión se creó en la org `Desarrollo_CapassoTech`, donde los
  colaboradores tienen acceso al proyecto `vialto`; se eliminó por ese motivo y
  se recreó en otra cuenta Neon).
- Base de datos: `neondb`
- Schema: `tracker`
- Región: `sa-east-1`
- Host: `ep-dawn-moon-ac9utlau.sa-east-1.aws.neon.tech`

Connection string: ver `DATABASE_URL` en `.env` (backend), **no** commitear. Hay un
`.env.example` con el formato esperado. El acceso a este proyecto Neon queda
restringido a quien tenga esa credencial — no dar acceso de colaborador/miembro en
la consola de Neon a menos que corresponda.

Aplicado y validado por conexión directa (`pg` driver, sin pasar por integraciones
compartidas): las 7 tablas existen y son accesibles vía `tracker.*`
(`app_users`, `collaborators`, `clients`, `projects`, `project_collaborators`,
`client_functional_analysts`, `time_entries`), con las 9 foreign keys esperadas
(`RESTRICT` en `time_entries`, `CASCADE` en las tablas puente, `SET NULL` en los
vínculos opcionales a `app_users`/`clients`).

## Tablas

### `tracker.app_users`
Espejo de Firestore `/users`. Perfil liviano de auth/rol, keyed por Firebase Auth UID,
usado por `AuthContext` para resolver roles al loguearse.

| Columna | Tipo | Notas |
|---|---|---|
| id | text PK | Firebase Auth UID |
| email | text, unique | |
| name | text | default `''` |
| roles | user_role[] | default `{colaborador}` |
| hourly_rate | numeric(12,2) | default `0` |
| created_at / updated_at | timestamptz | |

### `tracker.collaborators`
Espejo de Firestore `/colaboradores`.

| Columna | Tipo | Notas |
|---|---|---|
| id | text PK | |
| user_id | text FK → app_users | opcional (`Colaborador.uid`) |
| name | text NOT NULL | |
| personal_email / work_email | text | opcionales |
| password | text | **legacy, texto plano**, igual que hoy (deuda técnica, ver sección abajo) |
| hourly_rate | numeric(12,2) NOT NULL | |
| currency | billing_currency NOT NULL | default `USD` |
| exchange_rate | numeric(12,4) | opcional |
| active | boolean NOT NULL | default `true` |
| started_date | date NOT NULL | |
| birth_date | date | opcional |
| payment_method | text | libre, ej. "Transferencia bancaria" |
| phone, city, address, floor, province, postal_code, cbu_cvu | text | opcionales |
| roles | user_role[] NOT NULL | default `{colaborador}` |
| show_financial_values | boolean NOT NULL | default `true` |
| profile_image_url | text | opcional |

Índice único parcial en `work_email` (replica que Firebase Auth exige email único).

### `tracker.clients`
Espejo de Firestore `/clients`.

| Columna | Tipo | Notas |
|---|---|---|
| id | text PK | |
| user_id | text FK → app_users | opcional (`Client.uid`) |
| name | text NOT NULL | |
| email, phone, address, city, province, postal_code, floor | text | opcionales |
| razon_social, cuit, iva_condition | text | opcionales, `iva_condition` es texto libre |
| password | text | **legacy, texto plano**, igual que hoy |
| billing_currency | billing_currency NOT NULL | default `USD` |
| billable_config | jsonb NOT NULL | `BillableHoursCalculationConfig` completo, incluye `collaboratorOverrides` |
| profile_image_url | text | opcional |
| billable_hours_limit | numeric(12,2) | opcional |

`billable_config` se guarda como JSON (no normalizado) para conservar la misma
flexibilidad que tiene hoy la regla de negocio: `baseFactorStrategy`, `customBaseFactor`,
`markupMultiplier`, `internalBugMarkupMultiplier`, `additionalFixedHours`,
`minimumBillableHours` y `collaboratorOverrides` (mapa `collaboradorId -> horas`).

### `tracker.projects`
Espejo de Firestore `/projects`.

| Columna | Tipo | Notas |
|---|---|---|
| id | text PK | |
| name | text NOT NULL | |
| active | boolean NOT NULL | default `true` |
| rate | numeric(12,2) | opcional |
| currency | billing_currency | opcional |
| contract_end_date | date | opcional |
| billing_type | project_billing_type | opcional; si falta, el frontend asume `hourly` (misma regla de hoy) |
| client_id | text FK → clients | opcional, `ON DELETE SET NULL` |
| jira_ids | text[] NOT NULL | default `{}`, no son FK (ids externos de Jira) |
| billable_hours_limit | numeric(12,2) | opcional |

Nota: los campos duplicados que existían en Firestore por compatibilidad
(`hoursLimit`, `monthlyHoursLimit`, espejos de `billableHoursLimit`) no se replican:
en el modelo relacional una sola columna (`billable_hours_limit`) alcanza.

### Tablas puente (normalizan arrays de ids que Firestore guardaba dentro del doc)

- **`tracker.project_collaborators`** (`project_id`, `collaborator_id`, `role`) ← unifica
  `Project.managerIds` y `Project.teamMemberIds` en una sola tabla, diferenciando la
  fila por `role` (`project_collaborator_role`: `manager` | `team_member`). Antes eran
  dos tablas separadas (`project_managers` y `project_team_members`); se unificaron
  porque un mismo colaborador puede ser manager en un proyecto y team member en otro,
  y ese rol es propio de la asignación al proyecto, **no** el rol global de
  `collaborators.roles`.
- **`tracker.client_functional_analysts`** (`client_id`, `collaborator_id`) ← `Client.analistaFuncionalIds`

Todas con PK compuesta y `ON DELETE CASCADE` (si se borra el proyecto/cliente,
desaparecen sus asignaciones; borrar un colaborador borra sus asignaciones pero no al colaborador).

### `tracker.time_entries`
Espejo de Firestore `/timeEntries`.

| Columna | Tipo | Notas |
|---|---|---|
| id | text PK | |
| collaborator_id | text FK → collaborators, NOT NULL | `ON DELETE RESTRICT` |
| collaborator_name | text NOT NULL | snapshot denormalizado, igual que hoy |
| task_id | text NOT NULL | referencia externa (Jira), no es FK |
| task_title | text NOT NULL | |
| project_id | text FK → projects, NOT NULL | `ON DELETE RESTRICT` |
| project_name | text NOT NULL | snapshot denormalizado, igual que hoy |
| date | date NOT NULL | día calendario (medianoche local), no timestamp |
| hours | numeric(6,2) NOT NULL | |
| comments | text | opcional |
| task_billing_type | task_billing_type NOT NULL | default `feature` |
| created_at | timestamptz NOT NULL | default `now()` |

## Relaciones (resumen)

```
clients 1───N projects (client_id, ON DELETE SET NULL)
projects N───N collaborators   vía project_collaborators (role: manager | team_member)
clients  N───N collaborators   vía client_functional_analysts
collaborators 1───N time_entries (ON DELETE RESTRICT)
projects      1───N time_entries (ON DELETE RESTRICT)
app_users 1───1 collaborators (user_id, opcional)
app_users 1───1 clients       (user_id, opcional)
```

## Decisiones tomadas con el usuario

1. **Borrado de colaboradores/proyectos con horas cargadas**: se bloquea (`ON DELETE
   RESTRICT`) en vez de permitir el borrado como hace hoy Firestore. Para dar de baja
   un colaborador o proyecto hay que usar el flag `active = false`, que ya existe.
2. **Campo `password`**: se mantiene igual (texto plano) en `collaborators` y `clients`
   para no cambiar comportamiento ahora. Queda marcado como deuda técnica de seguridad
   a resolver en una tarea aparte (no se migran credenciales reales sin ese trabajo).
3. **Enums vs texto libre**: se usaron enums de Postgres solo donde el código ya trataba
   el campo como un conjunto cerrado de valores (`roles`, `billingCurrency`,
   `taskBillingType`, `project.billingType`, `baseFactorStrategy`). Campos como
   `paymentMethod` o `ivaCondition` son texto libre en el frontend (inputs sin opciones
   predefinidas), así que se mantuvieron como `text`.
4. **`project_managers` + `project_team_members` → `project_collaborators`**: se
   unificaron en una sola tabla puente con columna `role`, en vez de dos tablas
   idénticas en estructura que solo se diferenciaban por su nombre.

## Próximos pasos (fuera de esta tarea)

- Migración de datos real desde Firestore hacia estas tablas.
- Conectar el backend NestJS a Neon (ORM, módulo de configuración, variables de entorno).
