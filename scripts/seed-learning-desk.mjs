/**
 * Adds Learning & Training rows for the screenshot desk.
 * Does not update or delete Phase 3, Phase 8, or Phase 9.
 *
 *   node --env-file=.env.local scripts/seed-learning-desk.mjs
 */
import pg from "pg";

const connectionString = process.env.SESSION_POOLER_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing SESSION_POOLER_DATABASE_URL or DATABASE_URL.");
  process.exit(1);
}

const academy = [
  {
    code: "HS-HEAT-01",
    title: "Heat stress awareness for site and event teams",
    summary: "Recognise heat exposure, follow rest and hydration controls, and escalate possible heat illness promptly.",
    minutes: 25,
    cover: "/learning-art/cover-safety.jpg",
    type: "INDUCTION",
    required: true,
    status: "PUBLISHED",
    session: false,
    lessons: ["Heat exposure on site", "Rest, water and escalation"],
  },
  {
    code: "CROWD-FEC-01",
    title: "Event, mall activation and FEC crowd safety",
    summary: "Keep public routes usable, recognise pressure around queues, and escalate crowd concerns.",
    minutes: 25,
    cover: "/learning-art/cover-safety.jpg",
    type: "SAFETY",
    required: false,
    status: "PUBLISHED",
    session: false,
    lessons: ["Routes and queues", "When to escalate"],
  },
  {
    code: "MANUAL-01",
    title: "Safe manual handling awareness",
    summary: "Plan safer movement of stock, barriers and event equipment.",
    minutes: 25,
    cover: "/learning-art/cover-safety.jpg",
    type: "SAFETY",
    required: false,
    status: "PUBLISHED",
    session: false,
    lessons: ["Plan the move", "Barriers and equipment"],
  },
  {
    code: "FIRSTAID-01",
    title: "First aid awareness for employees",
    summary: "Recognise an emergency, summon help and understand safe initial actions. This is awareness only, not a first-aider course.",
    minutes: 30,
    cover: "/learning-art/cover-first-aid.jpg",
    type: "SAFETY",
    required: false,
    status: "PUBLISHED",
    session: false,
    lessons: ["Recognise an emergency", "Summon help"],
    quiz: true,
  },
  {
    code: "FIRE-EVAC-01",
    title: "Fire safety and evacuation awareness",
    summary: "Prevent avoidable fire risks and understand the employee response to alarms, evacuation and assembly.",
    minutes: 25,
    cover: "/learning-art/cover-fire.jpg",
    type: "SAFETY",
    required: false,
    status: "PUBLISHED",
    session: false,
    lessons: ["Alarm and evacuation", "Assembly points"],
  },
  {
    code: "HSE-WORK-01",
    title: "Workplace HSE awareness",
    summary: "Recognise workplace hazards, prevent routine incidents and report concerns across offices and sites.",
    minutes: 25,
    cover: "/learning-art/cover-safety.jpg",
    type: "SAFETY",
    required: false,
    status: "DRAFT",
    session: false,
    lessons: ["Hazards and reporting"],
  },
];

const external = [
  {
    code: "EXT-EMERG-01",
    title: "Emergency response refresher",
    summary: "In-person refresher for the first response on a live site.",
    minutes: 90,
    cover: "/learning-art/cover-fire.jpg",
    type: "SAFETY",
    required: false,
    status: "PUBLISHED",
    session: true,
    lessons: ["Site response drill"],
  },
  {
    code: "EXT-SAFE-01",
    title: "Safe activity operations",
    summary: "In-person session for running an activity safely with guests on the floor.",
    minutes: 90,
    cover: "/learning-art/cover-safety.jpg",
    type: "SKILL",
    required: false,
    status: "PUBLISHED",
    session: true,
    lessons: ["Activity floor brief"],
  },
  {
    code: "EXT-GUEST-01",
    title: "Guest experience and accessibility",
    summary: "In-person session on welcoming guests and adjusting the visit for access needs.",
    minutes: 90,
    cover: "/learning-art/cover-guest.jpg",
    type: "SKILL",
    required: false,
    status: "PUBLISHED",
    session: true,
    lessons: ["Welcome and access"],
  },
  {
    code: "EXT-WELCOME-01",
    title: "Welcome & first 30 days",
    summary: "In-person induction for the first month on a site.",
    minutes: 90,
    cover: "/learning-art/cover-welcome.jpg",
    type: "INDUCTION",
    required: false,
    status: "PUBLISHED",
    session: true,
    lessons: ["First month on site"],
  },
];

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query("select set_config('training.authoritative_write', '1', true)");

  const owner = await client.query(
    `select created_by from training_courses where code = 'P3BUILDER02' limit 1`,
  );
  const createdBy = owner.rows[0]?.created_by;
  if (!createdBy) throw new Error("Phase 3 course is missing, so there is no owner to copy.");

  const adil = await client.query(
    `select id, full_name, employee_code
     from staff
     where deleted_at is null and full_name ilike 'Adil Bashir Ahmed'
     order by created_at
     limit 1`,
  );
  if (!adil.rows[0]) throw new Error("Adil Bashir Ahmed was not found on staff.");

  const people = await client.query(
    `select id, full_name, employee_code
     from staff
     where deleted_at is null
       and full_name is not null
       and id <> $1
     order by full_name
     limit 8`,
    [adil.rows[0].id],
  );
  if (people.rows.length < 4) throw new Error("Not enough existing staff to enroll.");

  const location = await client.query(
    `select id, name from locations order by name limit 1`,
  );
  if (!location.rows[0]) throw new Error("No location exists for an in-person session.");

  const courses = new Map();
  for (const spec of [...academy, ...external]) {
    courses.set(spec.code, await ensureCourse(spec, createdBy));
  }

  const adilId = adil.rows[0].id;
  const [heat, crowd, manual, firstAid, fire] = ["HS-HEAT-01", "CROWD-FEC-01", "MANUAL-01", "FIRSTAID-01", "FIRE-EVAC-01"].map((code) => courses.get(code));

  await enroll({
    staffId: adilId,
    course: heat,
    status: "ENROLLED",
    dueOn: "2026-11-20",
    progressLessons: 0,
  });
  await enroll({
    staffId: adilId,
    course: manual,
    status: "IN_PROGRESS",
    dueOn: "2026-11-01",
    progressLessons: 1,
  });
  await enroll({
    staffId: adilId,
    course: firstAid,
    status: "COMPLETED",
    dueOn: "2026-08-15",
    progressLessons: 2,
    score: 92,
    completed: true,
  });

  const teamPlan = [
    { person: 0, course: fire, status: "IN_PROGRESS", dueOn: "2026-11-12", progressLessons: 1 },
    { person: 1, course: crowd, status: "COMPLETED", dueOn: "2026-09-01", progressLessons: 2, score: 80, completed: true },
    { person: 2, course: heat, status: "ENROLLED", dueOn: "2026-09-20", progressLessons: 0 },
    { person: 3, course: manual, status: "IN_PROGRESS", dueOn: "2026-11-18", progressLessons: 1, failed: true },
    { person: 4, course: fire, status: "COMPLETED", dueOn: "2026-07-30", progressLessons: 2, score: 76, completed: true },
    { person: 5, course: heat, status: "IN_PROGRESS", dueOn: "2026-09-29", progressLessons: 1 },
  ];
  for (const row of teamPlan) {
    const person = people.rows[row.person];
    if (!person) continue;
    await enroll({ staffId: person.id, ...row });
  }

  const externalCourses = external.map((spec) => courses.get(spec.code));
  const externalPlan = [];
  const statuses = [
    { status: "COMPLETED", dueOn: "2026-10-04", progressLessons: 1, score: 88, completed: true },
    { status: "IN_PROGRESS", dueOn: "2026-10-20", progressLessons: 0 },
    { status: "ENROLLED", dueOn: "2026-09-18", progressLessons: 0 },
    { status: "IN_PROGRESS", dueOn: "2026-10-28", progressLessons: 0, failed: true },
  ];
  let n = 0;
  for (const course of externalCourses) {
    for (let i = 0; i < 3; i += 1) {
      const person = people.rows[(n + i) % people.rows.length];
      const shape = statuses[n % statuses.length];
      externalPlan.push({ staffId: person.id, course, ...shape });
      n += 1;
    }
  }
  for (const row of externalPlan) await enroll(row);

  const sessionIds = [];
  for (let i = 0; i < external.length; i += 1) {
    const course = courses.get(external[i].code);
    const starts = new Date(Date.UTC(2026, 9, 20 + i * 3, 6, 0, 0));
    const ends = new Date(starts.getTime() + 3 * 60 * 60 * 1000);
    const existing = await client.query(
      `select id from training_sessions where course_id = $1 and starts_at = $2 limit 1`,
      [course.id, starts.toISOString()],
    );
    let sessionId = existing.rows[0]?.id;
    if (!sessionId) {
      const inserted = await client.query(
        `insert into training_sessions (
           course_id, version_id, location_id, trainer_staff_id, starts_at, ends_at, capacity, room, status, created_by
         ) values ($1,$2,$3,$4,$5,$6,16,$7,'SCHEDULED',$8)
         returning id`,
        [
          course.id,
          course.versionId,
          location.rows[0].id,
          adilId,
          starts.toISOString(),
          ends.toISOString(),
          "Training room",
          createdBy,
        ],
      );
      sessionId = inserted.rows[0].id;
    }
    sessionIds.push(sessionId);
    const guests = [people.rows[i % people.rows.length], people.rows[(i + 1) % people.rows.length]];
    for (const guest of guests) {
      await client.query(
        `insert into training_session_participants (session_id, staff_id, added_by)
         values ($1,$2,$3)
         on conflict (session_id, staff_id) do nothing`,
        [sessionId, guest.id, createdBy],
      );
    }
  }

  await client.query("COMMIT");

  const counts = await client.query(
    `select
       (select count(*) from training_courses where code = any($1::text[]))::int as courses,
       (select count(*) from training_course_enrollments e
          join training_courses c on c.id = e.course_id
          where c.code = any($1::text[]))::int as enrollments,
       (select count(*) from training_sessions s
          join training_courses c on c.id = s.course_id
          where c.code = any($1::text[]))::int as sessions`,
    [[...academy, ...external].map((spec) => spec.code)],
  );
  console.log(JSON.stringify({
    adil: { name: adil.rows[0].full_name, code: adil.rows[0].employee_code },
    staff: people.rows.map((row) => ({ name: row.full_name, code: row.employee_code })),
    location: location.rows[0].name,
    sessions: sessionIds.length,
    counts: counts.rows[0],
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error instanceof Error ? error.message : "Seed failed");
  process.exitCode = 1;
} finally {
  await client.end();
}

async function ensureCourse(spec, createdBy) {
  const found = await client.query(
    `select c.id, c.published_version_id, v.id as version_id
     from training_courses c
     left join training_course_versions v on v.course_id = c.id and v.version_no = 1
     where c.code = $1
     limit 1`,
    [spec.code],
  );
  if (found.rows[0]?.id) {
    const versionId = found.rows[0].version_id ?? found.rows[0].published_version_id;
    const lessons = await client.query(
      `select l.id from training_lessons l
       join training_sections s on s.id = l.section_id
       where s.version_id = $1 and l.kind = 'TEXT'
       order by l.sort_order`,
      [versionId],
    );
    return { id: found.rows[0].id, versionId, lessonIds: lessons.rows.map((row) => row.id), reused: true };
  }

  const course = await client.query(
    `insert into training_courses (
       code, title, summary, description, status, training_type, difficulty, estimated_minutes,
       thumbnail_path, required, requires_session_attendance, created_by
     ) values ($1,$2,$3,$3,$4,$5,'BEGINNER',$6,$7,$8,$9,$10)
     returning id`,
    [
      spec.code,
      spec.title,
      spec.summary,
      spec.status,
      spec.type,
      spec.minutes,
      spec.cover,
      spec.required,
      spec.session,
      createdBy,
    ],
  );
  const courseId = course.rows[0].id;
  const version = await client.query(
    `insert into training_course_versions (course_id, version_no, status, title, published_at, published_by)
     values ($1, 1, $2, $3, case when $2 = 'PUBLISHED' then now() else null end, case when $2 = 'PUBLISHED' then $4::uuid else null end)
     returning id`,
    [courseId, spec.status, spec.title, createdBy],
  );
  const versionId = version.rows[0].id;
  if (spec.status === "PUBLISHED") {
    await client.query(`update training_courses set published_version_id = $2 where id = $1`, [courseId, versionId]);
  }
  const section = await client.query(
    `insert into training_sections (version_id, title, sort_order) values ($1, 'Lessons', 0) returning id`,
    [versionId],
  );
  const lessonIds = [];
  for (let i = 0; i < spec.lessons.length; i += 1) {
    const lesson = await client.query(
      `insert into training_lessons (section_id, title, sort_order, kind, body, required)
       values ($1,$2,$3,'TEXT',$4,true)
       returning id`,
      [section.rows[0].id, spec.lessons[i], i, spec.summary],
    );
    lessonIds.push(lesson.rows[0].id);
  }
  if (spec.quiz) {
    const quiz = await client.query(
      `insert into training_lessons (section_id, title, sort_order, kind, body, required)
       values ($1, 'Awareness check', $2, 'QUIZ', 'One question on the safe first action.', false)
       returning id`,
      [section.rows[0].id, spec.lessons.length],
    );
    const bank = await client.query(
      `insert into training_question_banks (name, category, created_by)
       values ('First aid awareness', 'SAFETY', $1)
       returning id`,
      [createdBy],
    );
    const question = await client.query(
      `insert into training_bank_questions (bank_id, kind, prompt, difficulty, course_id, points, options)
       values ($1, 'MULTIPLE_CHOICE', 'What is the safe first action when a colleague looks unwell from the heat?', 'EASY', $2, 1, $3::jsonb)
       returning id`,
      [
        bank.rows[0].id,
        courseId,
        JSON.stringify([
          { id: "a", label: "Move them into shade and call for help" },
          { id: "b", label: "Leave them and finish the task" },
        ]),
      ],
    );
    await client.query(
      `insert into training_bank_question_keys (question_id, correct, explanation)
       values ($1, $2::jsonb, 'Shade and help come before any other task.')`,
      [question.rows[0].id, JSON.stringify({ optionId: "a" })],
    );
    await client.query(
      `insert into training_lesson_quizzes (lesson_id, bank_id, draw_count, passing_score, max_attempts, shuffle_questions, shuffle_options)
       values ($1,$2,1,70,2,true,true)`,
      [quiz.rows[0].id, bank.rows[0].id],
    );
  }
  return { id: courseId, versionId, lessonIds, reused: false };
}

async function enroll({ staffId, course, status, dueOn, progressLessons, score = null, completed = false, failed = false }) {
  const existing = await client.query(
    `select id from training_course_enrollments where staff_id = $1 and version_id = $2 limit 1`,
    [staffId, course.versionId],
  );
  let enrollmentId = existing.rows[0]?.id;
  if (!enrollmentId) {
    const inserted = await client.query(
      `insert into training_course_enrollments (
         staff_id, course_id, version_id, status, due_on, completed_at, score, started_at
       ) values (
         $1,$2,$3,$4,$5,
         case when $6 then now() else null end,
         $7,
         case when $4 = 'ENROLLED' and not $6 then null else now() end
       )
       returning id`,
      [staffId, course.id, course.versionId, status, dueOn, completed, score],
    );
    enrollmentId = inserted.rows[0].id;
  }
  const lessonIds = course.lessonIds.slice(0, progressLessons);
  for (const lessonId of lessonIds) {
    await client.query(
      `insert into training_progress (enrollment_id, lesson_id, completed_at)
       values ($1,$2,now())
       on conflict (enrollment_id, lesson_id) do nothing`,
      [enrollmentId, lessonId],
    );
  }
  if (failed) {
    const prior = await client.query(
      `select id from training_attempts where enrollment_id = $1 and passed = false limit 1`,
      [enrollmentId],
    );
    if (!prior.rows[0]) {
      await client.query(
        `insert into training_attempts (enrollment_id, staff_id, answers, score, passed, submitted_at)
         values ($1,$2,'[]'::jsonb,40,false,now())`,
        [enrollmentId, staffId],
      );
    }
  }
}
