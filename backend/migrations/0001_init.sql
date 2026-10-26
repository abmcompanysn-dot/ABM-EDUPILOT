-- EduPilote v2 : schéma initial (une seule école).

CREATE TABLE settings (
    key        text PRIMARY KEY,
    value      jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role                 text NOT NULL CHECK (role IN ('admin', 'responsable', 'etudiant')),
    email                text NOT NULL,
    password_hash        text NOT NULL,
    full_name            text NOT NULL,
    phone                text NOT NULL DEFAULT '',
    active               boolean NOT NULL DEFAULT true,
    must_change_password boolean NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),
    last_login_at        timestamptz
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE auth_sessions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash bytea NOT NULL UNIQUE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    user_agent text NOT NULL DEFAULT '',
    ip         text NOT NULL DEFAULT ''
);
CREATE INDEX auth_sessions_user ON auth_sessions (user_id);

CREATE TABLE academic_years (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label     text NOT NULL UNIQUE,
    starts_on date NOT NULL,
    ends_on   date NOT NULL,
    active    boolean NOT NULL DEFAULT false,
    CHECK (ends_on > starts_on)
);
CREATE UNIQUE INDEX academic_years_one_active ON academic_years (active) WHERE active;

CREATE TABLE filieres (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classes (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    filiere_id       uuid NOT NULL REFERENCES filieres (id) ON DELETE RESTRICT,
    academic_year_id uuid REFERENCES academic_years (id) ON DELETE SET NULL,
    name             text NOT NULL,
    invite_code      text NOT NULL UNIQUE,
    invite_open      boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (filiere_id, name)
);

CREATE TABLE class_managers (
    class_id uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (class_id, user_id)
);
CREATE INDEX class_managers_user ON class_managers (user_id);

CREATE TABLE students (
    user_id        uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    matricule      text NOT NULL UNIQUE,
    class_id       uuid NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
    birth_date     date,
    enrolled_at    timestamptz NOT NULL DEFAULT now(),
    photo          bytea,
    photo_type     text NOT NULL DEFAULT '',
    profile_slug   text NOT NULL UNIQUE,
    profile_public boolean NOT NULL DEFAULT false,
    headline       text NOT NULL DEFAULT '',
    bio            text NOT NULL DEFAULT '',
    skills         text[] NOT NULL DEFAULT '{}',
    links          jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX students_class ON students (class_id);

CREATE TABLE photo_requests (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES students (user_id) ON DELETE CASCADE,
    photo      bytea NOT NULL,
    photo_type text NOT NULL,
    status     text NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'approuvee', 'refusee')),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    decided_by uuid REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE modules (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id      uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    name          text NOT NULL,
    teacher       text NOT NULL DEFAULT '',
    planned_hours integer NOT NULL DEFAULT 0 CHECK (planned_hours >= 0),
    status        text NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_cours', 'termine')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (class_id, name)
);

CREATE TABLE course_sessions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id              uuid NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
    class_id               uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    starts_at              timestamptz NOT NULL,
    ends_at                timestamptz NOT NULL,
    room                   text NOT NULL DEFAULT '',
    mode                   text NOT NULL DEFAULT 'presentiel' CHECK (mode IN ('presentiel', 'en_ligne')),
    status                 text NOT NULL DEFAULT 'prevu' CHECK (status IN ('prevu', 'confirme', 'annule')),
    created_by             uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    absences_processed_at  timestamptz,
    CHECK (ends_at > starts_at),
    CHECK (ends_at - starts_at <= interval '12 hours')
);
CREATE INDEX course_sessions_class_time ON course_sessions (class_id, starts_at);
CREATE INDEX course_sessions_unprocessed ON course_sessions (ends_at) WHERE absences_processed_at IS NULL;

CREATE TABLE attendance (
    session_id  uuid NOT NULL REFERENCES course_sessions (id) ON DELETE CASCADE,
    student_id  uuid NOT NULL REFERENCES students (user_id) ON DELETE CASCADE,
    status      text NOT NULL CHECK (status IN ('present', 'retard', 'excuse')),
    method      text NOT NULL CHECK (method IN ('nfc', 'qr', 'porte', 'manuel', 'en_ligne')),
    arrived_at  timestamptz NOT NULL,
    left_at     timestamptz,
    latitude    double precision,
    longitude   double precision,
    recorded_by uuid REFERENCES users (id) ON DELETE SET NULL,
    note        text NOT NULL DEFAULT '',
    PRIMARY KEY (session_id, student_id)
);
CREATE INDEX attendance_student ON attendance (student_id);

CREATE TABLE absence_streaks (
    student_id      uuid PRIMARY KEY REFERENCES students (user_id) ON DELETE CASCADE,
    streak          integer NOT NULL DEFAULT 0,
    last_session_id uuid,
    alerted         boolean NOT NULL DEFAULT false
);

CREATE TABLE id_cards (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    uid              text NOT NULL UNIQUE,
    kind             text NOT NULL CHECK (kind IN ('sun', 'uid')),
    student_id       uuid NOT NULL REFERENCES students (user_id) ON DELETE CASCADE,
    academic_year_id uuid REFERENCES academic_years (id) ON DELETE SET NULL,
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'perdue', 'revoquee', 'remplacee')),
    last_counter     integer NOT NULL DEFAULT -1,
    key_version      integer NOT NULL DEFAULT 1,
    issued_at        timestamptz NOT NULL DEFAULT now(),
    issued_by        uuid REFERENCES users (id) ON DELETE SET NULL,
    revoked_at       timestamptz
);
CREATE UNIQUE INDEX id_cards_one_active ON id_cards (student_id) WHERE status = 'active';

CREATE TABLE devices (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    location      text NOT NULL DEFAULT '',
    secret_sealed bytea NOT NULL,
    open_ms       integer NOT NULL DEFAULT 5000 CHECK (open_ms BETWEEN 500 AND 30000),
    active        boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz
);

CREATE TABLE door_events (
    id         bigserial PRIMARY KEY,
    device_id  uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    card_uid   text NOT NULL DEFAULT '',
    student_id uuid REFERENCES students (user_id) ON DELETE SET NULL,
    allowed    boolean NOT NULL,
    reason     text NOT NULL,
    at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX door_events_at ON door_events (at DESC);

CREATE TABLE device_nonces (
    device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    nonce     text NOT NULL,
    seen_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (device_id, nonce)
);

CREATE TABLE announcements (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id  uuid REFERENCES users (id) ON DELETE SET NULL,
    class_id   uuid REFERENCES classes (id) ON DELETE CASCADE,
    title      text NOT NULL,
    body       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE announcement_reads (
    announcement_id uuid NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    read_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE notifications (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text NOT NULL,
    title      text NOT NULL,
    body       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at    timestamptz
);
CREATE INDEX notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE feedback (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
    rating     integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
    id           bigserial PRIMARY KEY,
    event_id     uuid NOT NULL UNIQUE,
    topic        text NOT NULL,
    key          text NOT NULL,
    payload      jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX outbox_pending ON outbox (id) WHERE published_at IS NULL;

CREATE TABLE audit_log (
    event_id    uuid PRIMARY KEY,
    type        text NOT NULL,
    actor_id    uuid,
    subject     text NOT NULL DEFAULT '',
    occurred_at timestamptz NOT NULL,
    data        jsonb NOT NULL
);
CREATE INDEX audit_log_time ON audit_log (occurred_at DESC);
CREATE INDEX audit_log_type ON audit_log (type, occurred_at DESC);
