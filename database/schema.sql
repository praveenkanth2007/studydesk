-- NeonFlow schema. Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'student' CHECK (role IN ('student','faculty','admin')),
  department    VARCHAR(100) NOT NULL DEFAULT '',
  theme         VARCHAR(5)   NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light')),
  daily_goal    SMALLINT     NOT NULL DEFAULT 3 CHECK (daily_goal BETWEEN 1 AND 20),
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  kind        VARCHAR(12)  NOT NULL DEFAULT 'study_group' CHECK (kind IN ('class','study_group')),
  subject     VARCHAR(80)  NOT NULL DEFAULT '',
  invite_code VARCHAR(12)  NOT NULL UNIQUE,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('owner','faculty','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members (user_id);

CREATE TABLE IF NOT EXISTS channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name        VARCHAR(40) NOT NULL,
  description VARCHAR(200) NOT NULL DEFAULT '',
  kind        VARCHAR(14) NOT NULL DEFAULT 'subject' CHECK (kind IN ('general','announcements','subject')),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, name)
);

CREATE TABLE IF NOT EXISTS assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               VARCHAR(150) NOT NULL,
  instructions        TEXT NOT NULL DEFAULT '',
  subject             VARCHAR(80) NOT NULL DEFAULT '',
  priority            VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_at              TIMESTAMPTZ NOT NULL,
  requires_submission BOOLEAN NOT NULL DEFAULT true,
  max_marks           INTEGER NOT NULL DEFAULT 100 CHECK (max_marks BETWEEN 1 AND 1000),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignments_team_idx ON assignments (team_id, due_at);

CREATE TABLE IF NOT EXISTS assignment_recipients (
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(12) NOT NULL DEFAULT 'assigned'
                CHECK (status IN ('assigned','in_progress','submitted','under_review','graded','returned')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS assignment_recipients_student_idx ON assignment_recipients (student_id);

CREATE TABLE IF NOT EXISTS personal_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          VARCHAR(150) NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  priority       VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  category       VARCHAR(40) NOT NULL DEFAULT '',
  status         VARCHAR(12) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','completed')),
  start_at       TIMESTAMPTZ,
  due_at         TIMESTAMPTZ,
  est_minutes    INTEGER CHECK (est_minutes IS NULL OR est_minutes BETWEEN 0 AND 10080),
  actual_minutes INTEGER CHECK (actual_minutes IS NULL OR actual_minutes BETWEEN 0 AND 10080),
  notes          TEXT NOT NULL DEFAULT '',
  position       DOUBLE PRECISION NOT NULL DEFAULT 0,
  assignment_id  UUID REFERENCES assignments(id) ON DELETE SET NULL,
  shared_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,   -- NULL = private to the owner
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_tasks_user_status_idx ON personal_tasks (user_id, status, due_at);
CREATE INDEX IF NOT EXISTS personal_tasks_shared_idx ON personal_tasks (shared_team_id) WHERE shared_team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS personal_tasks_assignment_idx ON personal_tasks (assignment_id) WHERE assignment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS subtasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  title      VARCHAR(150) NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  position   DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subtasks_task_idx ON subtasks (task_id);

CREATE TABLE IF NOT EXISTS shared_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id       UUID REFERENCES teams(id) ON DELETE CASCADE,
  channel_id    UUID REFERENCES channels(id) ON DELETE SET NULL,
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  purpose       VARCHAR(12) NOT NULL DEFAULT 'team' CHECK (purpose IN ('team','chat','assignment','submission','personal')),
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(80) NOT NULL UNIQUE,
  mime_type     VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
  size_bytes    BIGINT NOT NULL CHECK (size_bytes >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_files_team_idx ON shared_files (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shared_files_uploader_idx ON shared_files (uploader_id);

CREATE TABLE IF NOT EXISTS submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL DEFAULT '',
  file_id       UUID REFERENCES shared_files(id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_late       BOOLEAN NOT NULL DEFAULT false,
  attempt       INTEGER NOT NULL DEFAULT 1,
  marks         NUMERIC(6,2) CHECK (marks IS NULL OR marks >= 0),
  feedback      TEXT NOT NULL DEFAULT '',
  graded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  graded_at     TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID REFERENCES channels(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,       -- set for direct messages
  parent_id    UUID REFERENCES messages(id) ON DELETE CASCADE,    -- set for thread replies
  body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  file_id      UUID REFERENCES shared_files(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(channel_id, recipient_id) = 1),
  CHECK (parent_id IS NULL OR channel_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_dm_idx ON messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_parent_idx ON messages (parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES comments(id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_assignment_idx ON comments (assignment_id, created_at);

CREATE TABLE IF NOT EXISTS read_receipts (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context      VARCHAR(60) NOT NULL,              -- 'c:<channelId>' or 'd:<otherUserId>'
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, context)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(30) NOT NULL,
  title      VARCHAR(150) NOT NULL,
  body       VARCHAR(500) NOT NULL DEFAULT '',
  link       VARCHAR(200) NOT NULL DEFAULT '',
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS activity_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  team_id     UUID REFERENCES teams(id) ON DELETE CASCADE,
  action      VARCHAR(40) NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id   UUID,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_team_idx ON activity_logs (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_user_idx ON activity_logs (user_id, created_at DESC);
