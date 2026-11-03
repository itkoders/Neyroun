-- =========================================================
-- NEURON: ma'lumotlar bazasi sxemasi (PostgreSQL)
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- Foydalanuvchilar va rollar ----------

CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'parent');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role            user_role NOT NULL,
    login           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,              -- bcrypt/argon2
    full_name       TEXT NOT NULL,
    phone           TEXT,
    telegram_id     BIGINT UNIQUE,              -- botga ulangandan keyin
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id)   -- admin yaratgan o'qituvchi
);

-- ---------- Guruhlar va o'quvchilar (repititor markazi) ----------

CREATE TABLE groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,           -- masalan: "Matematika 1-guruh"
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE students (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name   TEXT NOT NULL,
    group_id    UUID REFERENCES groups(id),
    birth_date  DATE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Fanlar va o'qituvchi biriktirish ----------

CREATE TABLE subjects (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name  TEXT NOT NULL UNIQUE                  -- "Matematika", "Fizika" ...
);

-- Qaysi o'qituvchi qaysi fanni qaysi guruhda o'qitadi
CREATE TABLE teaching_assignments (
    teacher_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    weight      NUMERIC(4,2) NOT NULL DEFAULT 1.00,   -- fan og'irlik koeffitsienti
    PRIMARY KEY (teacher_id, subject_id, group_id)
);

-- ---------- Ota-ona va farzand bog'lanishi ----------

CREATE TYPE link_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE parent_student_links (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status       link_status NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_by   UUID REFERENCES users(id),     -- tasdiqlagan admin
    decided_at   TIMESTAMPTZ,
    UNIQUE (parent_id, student_id)
);

-- Bir ota-ona uchun 3 tadan ko'p tasdiqlangan farzand bo'lmasligi kerak.
-- (Trigger yoki ilova qatlamida tekshiriladi; quyida trigger namunasi.)
CREATE OR REPLACE FUNCTION enforce_max_children() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' AND (
        SELECT COUNT(*) FROM parent_student_links
        WHERE parent_id = NEW.parent_id AND status = 'approved' AND id <> NEW.id
    ) >= 3 THEN
        RAISE EXCEPTION 'Ota-ona uchun 3 tadan ko''p farzand tasdiqlab bo''lmaydi';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_max_children
BEFORE INSERT OR UPDATE ON parent_student_links
FOR EACH ROW EXECUTE FUNCTION enforce_max_children();

-- ---------- Ballar (jurnal) ----------

CREATE TABLE grades (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_id  UUID NOT NULL REFERENCES subjects(id),
    teacher_id  UUID NOT NULL REFERENCES users(id),
    score       SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
    lesson_date DATE NOT NULL DEFAULT CURRENT_DATE,
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_grades_student_date ON grades (student_id, lesson_date);
CREATE INDEX idx_grades_subject_date ON grades (subject_id, lesson_date);

-- O'zgartirish tarixi (kim, qachon, nimani o'zgartirgani)
CREATE TABLE grade_history (
    id          BIGSERIAL PRIMARY KEY,
    grade_id    UUID NOT NULL,
    old_score   SMALLINT,
    new_score   SMALLINT,
    changed_by  UUID NOT NULL REFERENCES users(id),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- To'lovlar va jarimalar ----------

CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'overdue');

-- O'qituvchi sinf/o'quvchi uchun oylik to'lovni belgilaydi
CREATE TABLE payment_plans (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    teacher_id    UUID NOT NULL REFERENCES users(id),
    monthly_amount NUMERIC(12,2) NOT NULL CHECK (monthly_amount >= 0),
    due_day       SMALLINT NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28),
    penalty_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (penalty_amount >= 0),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, teacher_id)
);

CREATE TABLE payments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id      UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
    period_month DATE NOT NULL,                 -- oyning 1-kuni, masalan 2026-11-01
    amount_due   NUMERIC(12,2) NOT NULL,
    penalty      NUMERIC(12,2) NOT NULL DEFAULT 0,
    status       payment_status NOT NULL DEFAULT 'unpaid',
    paid_at      TIMESTAMPTZ,
    paid_amount  NUMERIC(12,2),
    note         TEXT,
    -- Jarima faqat o'qituvchi tomonidan qo'lda qo'yiladi (avtomatik emas)
    penalty_set_by  UUID REFERENCES users(id),
    penalty_set_at  TIMESTAMPTZ,
    UNIQUE (plan_id, period_month)
);

-- ---------- Haftalik toj (👑) ----------

CREATE TABLE weekly_crowns (
    week_start  DATE NOT NULL,                  -- haftaning dushanba kuni
    rank        SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 5),
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    avg_score   NUMERIC(5,2) NOT NULL,
    PRIMARY KEY (week_start, rank),
    UNIQUE (week_start, student_id)
);

-- ---------- Bildirishnomalar va audit ----------

CREATE TABLE notifications (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,                  -- 'grade', 'low_score', 'overdue', 'penalty', 'crown'
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    sent_at     TIMESTAMPTZ,                    -- Telegram'ga yuborilgan vaqt (outbox)
    attempts    SMALLINT NOT NULL DEFAULT 0,
    last_error  TEXT,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    actor_id   UUID REFERENCES users(id),
    action     TEXT NOT NULL,                   -- 'grade.create', 'payment.mark_paid', ...
    entity     TEXT NOT NULL,
    entity_id  UUID,
    meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Ko'rinish (o'qituvchi uchun oylik diagramma) ----------

CREATE VIEW v_student_monthly_avg AS
SELECT
    g.student_id,
    g.subject_id,
    date_trunc('month', g.lesson_date)::date AS month,
    ROUND(AVG(g.score), 2) AS avg_score,
    COUNT(*) AS grades_count
FROM grades g
GROUP BY g.student_id, g.subject_id, date_trunc('month', g.lesson_date);

CREATE VIEW v_weekly_top AS
SELECT
    date_trunc('week', g.lesson_date)::date AS week_start,
    g.student_id,
    ROUND(AVG(g.score), 2) AS avg_score,
    RANK() OVER (
        PARTITION BY date_trunc('week', g.lesson_date)
        ORDER BY AVG(g.score) DESC
    ) AS rank
FROM grades g
GROUP BY date_trunc('week', g.lesson_date), g.student_id;
