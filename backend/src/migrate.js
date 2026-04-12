const supabase = require("./supabase");

async function migrate() {
  console.log("Running migrations...");

  const { error } = await supabase.rpc("exec_sql", {
    query: `
      -- Courses
      CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        difficulty TEXT DEFAULT 'Intermediate',
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Weeks
      CREATE TABLE IF NOT EXISTS weeks (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        course_id TEXT REFERENCES courses(id) ON DELETE CASCADE
      );

      -- Classes
      CREATE TABLE IF NOT EXISTS classes (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        theory_content TEXT DEFAULT '',
        learning_units JSONB DEFAULT '[]',
        resource_links JSONB DEFAULT '[]',
        week_id TEXT REFERENCES weeks(id) ON DELETE CASCADE
      );

      -- Add columns if table already exists
      DO $$ BEGIN
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS theory_content TEXT DEFAULT '';
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS learning_units JSONB DEFAULT '[]';
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS resource_links JSONB DEFAULT '[]';
      EXCEPTION WHEN others THEN NULL;
      END $$;

      -- Assignments
      CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        difficulty TEXT DEFAULT 'Intermediate',
        hints JSONB DEFAULT '[]',
        pitfalls JSONB DEFAULT '[]',
        aha_moment TEXT DEFAULT '',
        starter_code TEXT DEFAULT '',
        test_cases JSONB DEFAULT '[]',
        rubric JSONB DEFAULT '[]',
        class_id TEXT REFERENCES classes(id) ON DELETE CASCADE
      );

      -- Submissions
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
        class_id TEXT,
        assignment_id TEXT,
        student_id TEXT,
        trainee_name TEXT NOT NULL,
        code TEXT DEFAULT '',
        execution_output TEXT DEFAULT '',
        overall_score INTEGER DEFAULT 0,
        grade TEXT DEFAULT '',
        criterion_scores JSONB DEFAULT '[]',
        overall_feedback TEXT DEFAULT '',
        strengths JSONB DEFAULT '[]',
        improvements JSONB DEFAULT '[]',
        submitted_at TIMESTAMPTZ DEFAULT now()
      );

      -- Student Progress (per-unit completion tracking)
      CREATE TABLE IF NOT EXISTS student_progress (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        unit_index INTEGER NOT NULL,
        completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMPTZ,
        UNIQUE(student_id, class_id, unit_index)
      );

      -- Add student_id column if table already exists without it
      DO $$ BEGIN
        ALTER TABLE submissions ADD COLUMN IF NOT EXISTS student_id TEXT;
      EXCEPTION WHEN others THEN NULL;
      END $$;

      -- Add type/questions/files columns to assignments if missing
      DO $$ BEGIN
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'coding';
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS questions JSONB DEFAULT '[]';
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]';
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS solution_code TEXT DEFAULT '';
      EXCEPTION WHEN others THEN NULL;
      END $$;

      -- Add theory_content to classes for study material
      DO $$ BEGIN
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS theory_content TEXT DEFAULT '';
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `,
  });

  if (error) {
    console.log(
      "RPC exec_sql not available. Please run the SQL manually in Supabase SQL Editor:"
    );
    console.log(`
Go to: Supabase Dashboard → SQL Editor → New Query, then paste and run:

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT DEFAULT 'Intermediate',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weeks (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  theory_content TEXT DEFAULT '',
  week_id TEXT REFERENCES weeks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT DEFAULT 'Intermediate',
  type TEXT DEFAULT 'coding',
  hints JSONB DEFAULT '[]',
  pitfalls JSONB DEFAULT '[]',
  aha_moment TEXT DEFAULT '',
  starter_code TEXT DEFAULT '',
  solution_code TEXT DEFAULT '',
  test_cases JSONB DEFAULT '[]',
  rubric JSONB DEFAULT '[]',
  questions JSONB DEFAULT '[]',
  files JSONB DEFAULT '[]',
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  class_id TEXT,
  assignment_id TEXT,
  student_id TEXT,
  trainee_name TEXT NOT NULL,
  code TEXT DEFAULT '',
  execution_output TEXT DEFAULT '',
  overall_score INTEGER DEFAULT 0,
  grade TEXT DEFAULT '',
  criterion_scores JSONB DEFAULT '[]',
  overall_feedback TEXT DEFAULT '',
  strengths JSONB DEFAULT '[]',
  improvements JSONB DEFAULT '[]',
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- Disable RLS for development
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on courses" ON courses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on weeks" ON weeks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on classes" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on assignments" ON assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on submissions" ON submissions FOR ALL USING (true) WITH CHECK (true);
    `);
  } else {
    console.log("Migration complete!");
  }
}

migrate();
