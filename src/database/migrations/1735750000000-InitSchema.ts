import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea el schema "tracker" con las 7 tablas del modelo aprobado
 * (ver ../../../database/schema.sql y ../../../database/README.md).
 *
 * Es idempotente a propósito: los distintos entornos (local, rama develop /
 * QA, rama production) pueden partir de un branch de Neon que ya tenía este
 * schema aplicado a mano durante el diseño, así que up() no debe fallar si
 * los tipos/tablas ya existen.
 */
export class InitSchema1735750000000 implements MigrationInterface {
  name = 'InitSchema1735750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE SCHEMA IF NOT EXISTS tracker;

DO $$ BEGIN
  CREATE TYPE tracker.user_role AS ENUM (
    'colaborador','admin','project_manager','client','contable','analista_funcional','qa_tester'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tracker.billing_currency AS ENUM ('USD', 'ARS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tracker.project_billing_type AS ENUM ('hourly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tracker.task_billing_type AS ENUM (
    'feature','internal_bug','external_bug','internal_meeting','external_meeting'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tracker.billable_base_factor_strategy AS ENUM ('rate_ratio', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tracker.ticket_empresa AS ENUM ('vialto', 'capassotech');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tracker.ticket_priority AS ENUM ('baja', 'media', 'alta', 'urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tracker.ticket_state AS ENUM (
    'nuevo','en_revision','en_progreso','esperando_cliente','resuelto','cerrado','reabierto'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tracker.ticket_origin AS ENUM ('vialto_sso', 'capassotech_form', 'capassotech_login');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tracker.ticket_message_author AS ENUM ('cliente', 'agente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tracker.tickets (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  empresa tracker.ticket_empresa NOT NULL,
  sistema TEXT NOT NULL,
  asunto TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  prioridad tracker.ticket_priority NOT NULL,
  estado tracker.ticket_state NOT NULL DEFAULT 'nuevo',
  origen tracker.ticket_origin NOT NULL,
  cliente_nombre TEXT NOT NULL,
  cliente_email TEXT NOT NULL,
  client_id TEXT NULL REFERENCES tracker.clients(id) ON DELETE SET NULL,
  asignado_a TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracker.ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tracker.tickets(id) ON DELETE CASCADE,
  autor tracker.ticket_message_author NOT NULL,
  autor_nombre TEXT NULL,
  mensaje TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracker.ticket_attachments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tracker.tickets(id) ON DELETE CASCADE,
  nombre_archivo TEXT NOT NULL,
  url TEXT NOT NULL,
  tipo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracker.app_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  roles         tracker.user_role[] NOT NULL DEFAULT ARRAY['colaborador']::tracker.user_role[],
  hourly_rate   NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracker.collaborators (
  id                     TEXT PRIMARY KEY,
  user_id                TEXT NULL REFERENCES tracker.app_users(id) ON DELETE SET NULL,
  name                   TEXT NOT NULL,
  personal_email         TEXT NULL,
  work_email             TEXT NULL,
  password               TEXT NULL,
  hourly_rate            NUMERIC(12,2) NOT NULL,
  currency               tracker.billing_currency NOT NULL DEFAULT 'USD',
  exchange_rate          NUMERIC(12,4) NULL,
  active                 BOOLEAN NOT NULL DEFAULT true,
  started_date           DATE NOT NULL,
  birth_date             DATE NULL,
  payment_method         TEXT NULL,
  phone                  TEXT NULL,
  city                   TEXT NULL,
  address                TEXT NULL,
  floor                  TEXT NULL,
  province               TEXT NULL,
  postal_code            TEXT NULL,
  cbu_cvu                TEXT NULL,
  roles                  tracker.user_role[] NOT NULL DEFAULT ARRAY['colaborador']::tracker.user_role[],
  show_financial_values  BOOLEAN NOT NULL DEFAULT true,
  profile_image_url      TEXT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS collaborators_work_email_key ON tracker.collaborators (work_email) WHERE work_email IS NOT NULL;

COMMENT ON COLUMN tracker.collaborators.password IS
  'Legacy: se guarda en texto plano igual que hoy en Firestore. Deuda técnica a resolver en una tarea de seguridad aparte; no usar para nuevos flujos de auth.';

CREATE TABLE IF NOT EXISTS tracker.clients (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NULL REFERENCES tracker.app_users(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  email                 TEXT NULL,
  phone                 TEXT NULL,
  address               TEXT NULL,
  city                  TEXT NULL,
  province              TEXT NULL,
  postal_code           TEXT NULL,
  floor                 TEXT NULL,
  razon_social          TEXT NULL,
  cuit                  TEXT NULL,
  iva_condition         TEXT NULL,
  password              TEXT NULL,
  billing_currency      tracker.billing_currency NOT NULL DEFAULT 'USD',
  billable_config       JSONB NOT NULL DEFAULT '{
    "baseFactorStrategy": "rate_ratio",
    "customBaseFactor": null,
    "markupMultiplier": 1.6,
    "internalBugMarkupMultiplier": null,
    "additionalFixedHours": 0,
    "minimumBillableHours": null,
    "collaboratorOverrides": {}
  }'::jsonb,
  profile_image_url     TEXT NULL,
  billable_hours_limit  NUMERIC(12,2) NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN tracker.clients.billable_config IS
  'BillableHoursCalculationConfig completo (incluye collaboratorOverrides como mapa colaboradorId->horas) igual que en Firestore, para no perder flexibilidad de la regla de negocio.';
COMMENT ON COLUMN tracker.clients.password IS
  'Legacy: se guarda en texto plano igual que hoy en Firestore. Deuda técnica a resolver en una tarea de seguridad aparte; no usar para nuevos flujos de auth.';

CREATE TABLE IF NOT EXISTS tracker.projects (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  active                BOOLEAN NOT NULL DEFAULT true,
  rate                  NUMERIC(12,2) NULL,
  currency              tracker.billing_currency NULL,
  contract_end_date     DATE NULL,
  billing_type          tracker.project_billing_type NULL,
  client_id             TEXT NULL REFERENCES tracker.clients(id) ON DELETE SET NULL,
  jira_ids              TEXT[] NOT NULL DEFAULT '{}',
  billable_hours_limit  NUMERIC(12,2) NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN tracker.projects.billing_type IS
  'Nullable para reflejar que hoy es opcional en Firestore; el frontend asume "hourly" cuando falta (misma regla que hoy, resuelta en la capa de app, no en la DB).';

CREATE INDEX IF NOT EXISTS projects_client_id_idx ON tracker.projects (client_id);

CREATE TABLE IF NOT EXISTS tracker.project_collaborators (
  project_id       TEXT NOT NULL REFERENCES tracker.projects(id) ON DELETE CASCADE,
  collaborator_id  TEXT NOT NULL REFERENCES tracker.collaborators(id) ON DELETE CASCADE,
  role             tracker.project_collaborator_role NOT NULL,
  PRIMARY KEY (project_id, collaborator_id, role)
);

COMMENT ON TABLE tracker.project_collaborators IS
  'Reemplaza a project_managers y project_team_members. Project.managerIds -> filas con role=manager; Project.teamMemberIds -> filas con role=team_member.';

CREATE INDEX IF NOT EXISTS project_collaborators_collaborator_id_idx ON tracker.project_collaborators (collaborator_id);
CREATE INDEX IF NOT EXISTS project_collaborators_project_id_role_idx ON tracker.project_collaborators (project_id, role);

CREATE TABLE IF NOT EXISTS tracker.client_functional_analysts (
  client_id        TEXT NOT NULL REFERENCES tracker.clients(id) ON DELETE CASCADE,
  collaborator_id  TEXT NOT NULL REFERENCES tracker.collaborators(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, collaborator_id)
);

CREATE INDEX IF NOT EXISTS client_functional_analysts_collaborator_id_idx ON tracker.client_functional_analysts (collaborator_id);

CREATE TABLE IF NOT EXISTS tracker.time_entries (
  id                  TEXT PRIMARY KEY,
  collaborator_id     TEXT NOT NULL REFERENCES tracker.collaborators(id) ON DELETE RESTRICT,
  collaborator_name   TEXT NOT NULL,
  task_id             TEXT NOT NULL,
  task_title          TEXT NOT NULL,
  project_id          TEXT NOT NULL REFERENCES tracker.projects(id) ON DELETE RESTRICT,
  project_name        TEXT NOT NULL,
  date                DATE NOT NULL,
  hours               NUMERIC(6,2) NOT NULL,
  comments            TEXT NULL,
  task_billing_type   tracker.task_billing_type NOT NULL DEFAULT 'feature',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tracker.time_entries IS
  'FKs a collaborators/projects con ON DELETE RESTRICT: decisión deliberada para no poder borrar un colaborador o proyecto con horas cargadas (usar el flag "active" para desactivar).';

CREATE INDEX IF NOT EXISTS time_entries_collaborator_id_idx ON tracker.time_entries (collaborator_id);
CREATE INDEX IF NOT EXISTS time_entries_project_id_idx ON tracker.time_entries (project_id);
CREATE INDEX IF NOT EXISTS time_entries_date_idx ON tracker.time_entries (date);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DROP TABLE IF EXISTS tracker.time_entries;
DROP TABLE IF EXISTS tracker.client_functional_analysts;
DROP TABLE IF EXISTS tracker.project_collaborators;
DROP TABLE IF EXISTS tracker.projects;
DROP TABLE IF EXISTS tracker.clients;
DROP TABLE IF EXISTS tracker.collaborators;
DROP TABLE IF EXISTS tracker.app_users;

DROP TYPE IF EXISTS tracker.project_collaborator_role;
DROP TYPE IF EXISTS tracker.billable_base_factor_strategy;
DROP TYPE IF EXISTS tracker.task_billing_type;
DROP TYPE IF EXISTS tracker.project_billing_type;
DROP TYPE IF EXISTS tracker.billing_currency;
DROP TYPE IF EXISTS tracker.user_role;
    `);
  }
}
