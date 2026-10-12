-- DEVELOPMENT SEED DATA. All demo accounts use the password: Password123
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
DECLARE
  pw text := crypt('Password123', gen_salt('bf', 10));
  u_admin uuid := gen_random_uuid(); u_fac uuid := gen_random_uuid();
  u_asha uuid := gen_random_uuid(); u_ben uuid := gen_random_uuid(); u_chen uuid := gen_random_uuid();
  t_class uuid := gen_random_uuid(); t_group uuid := gen_random_uuid();
  c_gen uuid := gen_random_uuid(); c_ann uuid := gen_random_uuid(); c_sql uuid := gen_random_uuid();
  g_gen uuid := gen_random_uuid(); g_ann uuid := gen_random_uuid();
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); tk uuid := gen_random_uuid();
BEGIN
  INSERT INTO users(id,name,email,password_hash,role,department) VALUES
    (u_admin,'Ada Admin','admin@demo.neonflow.dev',pw,'admin','IT Services'),
    (u_fac,'Dr. Priya Nair','faculty@demo.neonflow.dev',pw,'faculty','Computer Science'),
    (u_asha,'Asha Rao','asha@demo.neonflow.dev',pw,'student','Computer Science'),
    (u_ben,'Ben Lee','ben@demo.neonflow.dev',pw,'student','Computer Science'),
    (u_chen,'Chen Wei','chen@demo.neonflow.dev',pw,'student','Information Technology');

  INSERT INTO teams(id,name,description,kind,subject,invite_code,owner_id) VALUES
    (t_class,'DBMS – Section A','Database Management Systems, Semester 5','class','DBMS','DEMO2026AA',u_fac),
    (t_group,'Algorithms Study Group','Weekly problem-solving sessions','study_group','Algorithms','STUDYGRP01',u_asha);
  INSERT INTO team_members(team_id,user_id,role) VALUES
    (t_class,u_fac,'owner'),(t_class,u_asha,'member'),(t_class,u_ben,'member'),(t_class,u_chen,'member'),
    (t_group,u_asha,'owner'),(t_group,u_ben,'member');
  INSERT INTO channels(id,team_id,name,description,kind,created_by) VALUES
    (c_gen,t_class,'General','Class-wide chat','general',u_fac),
    (c_ann,t_class,'Announcements','Official announcements','announcements',u_fac),
    (c_sql,t_class,'SQL Practice','Queries, joins and normalization','subject',u_fac),
    (g_gen,t_group,'General','Group chat','general',u_asha),
    (g_ann,t_group,'Announcements','Group announcements','announcements',u_asha);

  INSERT INTO assignments(id,team_id,created_by,title,instructions,subject,priority,due_at,max_marks) VALUES
    (a1,t_class,u_fac,'ER Diagram & Normalization',
     E'Design an ER diagram for a library management system.\n- Identify all entities, attributes and relationships.\n- Convert the diagram to relational tables.\n- Normalize the schema to 3NF and justify each step.\nSubmit a single PDF. Marks are deducted for late submissions.',
     'DBMS','high', now() + interval '3 days', 50),
    (a2,t_class,u_fac,'SQL Joins Worksheet',
     E'Complete the 12 questions on joins and subqueries.\nInclude the query and a screenshot of the output for each question.',
     'DBMS','medium', now() + interval '9 days', 30);
  INSERT INTO assignment_recipients(assignment_id,student_id,status)
    SELECT a, s, 'assigned' FROM unnest(ARRAY[a1,a2]) a, unnest(ARRAY[u_asha,u_ben,u_chen]) s;

  INSERT INTO personal_tasks(id,user_id,title,description,priority,category,status,due_at,est_minutes,position,assignment_id) VALUES
    (tk,u_asha,'Draw ER diagram','Entities and relationships','high','DBMS','in_progress', now() + interval '1 day',90,1000,a1),
    (gen_random_uuid(),u_asha,'Read graph algorithms chapter','Chapter 22','medium','Algorithms','todo', now() + interval '2 days',60,2000,NULL),
    (gen_random_uuid(),u_asha,'Submit lab record','','low','Networks','completed', now() - interval '1 day',30,3000,NULL),
    (gen_random_uuid(),u_asha,'Revise OS notes','','medium','Operating Systems','todo', now() - interval '2 days',45,4000,NULL);
  INSERT INTO subtasks(task_id,title,done,position) VALUES (tk,'List entities',true,1),(tk,'Add relationships',false,2),(tk,'Convert to tables',false,3);

  INSERT INTO messages(channel_id,sender_id,body) VALUES
    (c_ann,u_fac,'Welcome to DBMS Section A! Assignment 1 is now live. Please read the instructions carefully.'),
    (c_gen,u_asha,'Hi everyone 👋'),
    (c_gen,u_ben,'Does anyone have the lecture 4 slides?'),
    (g_gen,u_asha,'Shall we meet Thursday for dynamic programming?');
  INSERT INTO notifications(user_id,type,title,body,link) VALUES
    (u_asha,'assignment','New assignment: ER Diagram & Normalization','Due in 3 days','/assignments.html');
END $$;
