-- Demo seed: fictional people only. Demo viewer login: demo@bridge.local / bridge-demo-2026
create or replace function pg_temp.mk_user(p_email text, p_name text, p_password text) returns uuid
language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email, crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', p_name), now(), now(), '', '', '', '', false);
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;

do $$
declare v uuid; p uuid; r record;
begin
  v := pg_temp.mk_user('demo@bridge.local', 'Alex Morgan', 'bridge-demo-2026');
  update public.profiles set display_name = 'Alex Morgan', bio = 'Mobile engineer who bikes to work and wants to build a smart bike light.',
    role_title = 'Mobile Engineer', career_stage = 'Early career', company = 'Freelance', school = 'State University', major = 'Computer Science',
    industry = 'Software', city = 'Austin', region = 'TX', languages = '{English,Spanish}', contact_method = 'email', availability = 'Evenings and weekends',
    collaboration_prefs = 'Small teams, async-friendly', working_style = 'Ship small, learn fast', onboarding_complete = true, onboarding_step = 99 where id = v;
  insert into public.profile_tags (owner_id, kind, tag, label) values
    (v,'skill','mobile-development','Mobile development'), (v,'skill','typescript','TypeScript'), (v,'skill','react','React'), (v,'skill','product-design','Product design'), (v,'skill','hardware-prototyping','Hardware prototyping'),
    (v,'interest','cycling','Cycling'), (v,'interest','hardware-prototyping','Hardware prototyping'), (v,'interest','startups','Startups'), (v,'interest','sustainability','Sustainability'),
    (v,'goal','build-smart-bike-light','Build a smart bike light prototype'), (v,'goal','find-cofounder','Find a technical cofounder'),
    (v,'offer','mobile-development','Can build companion mobile apps'), (v,'offer','react','React code review');
  insert into public.discovery_prefs (owner_id, enabled) values (v, true) on conflict (owner_id) do update set enabled = true;

  -- Nearby demo personas (real demo accounts so both-opt-in rules are exercised for real)
  insert into demo.personas (key, email, display_name, role_title, company, school, city, bio, skills, interests, nearby_enabled, offset_east_m, offset_north_m, accuracy_m, radius_m, blocked_by_viewer, note) values
   ('maya','maya.demo@bridge.local','Maya Chen','Firmware Engineer','Lumen Labs','State University','Austin','Embedded engineer, weekend cyclist.','{embedded-systems,firmware,hardware-prototyping}','{cycling,hardware-prototyping}',true,20,22,8,100,false,'Existing contact; shares firmware + cycling. Should match (close).'),
   ('devon','devon.demo@bridge.local','Devon Park','Indie Developer','Self-employed','Tech Institute','Austin','Building side projects, looking for a cofounder.','{typescript,react,backend}','{startups,cycling}',true,-45,40,12,100,false,'New person; shares TypeScript + startups/cycling. Should match (nearby).'),
   ('lena','lena.demo@bridge.local','Lena Ortiz','iOS Engineer','AppWorks','','Austin','Mobile dev, climber.','{typescript,mobile-development}','{climbing,outdoors}',true,15,-20,10,100,false,'Shares skills but NO shared interest. Excluded.'),
   ('omar','omar.demo@bridge.local','Omar Haddad','Product Designer','Studio O','','Austin','Designer who cycles.','{product-design,ux-design}','{cycling,startups}',false,30,10,9,100,false,'Nearby turned OFF on their side. Excluded.'),
   ('yuki','yuki.demo@bridge.local','Yuki Tanaka','Hardware Engineer','MakerCo','','Austin','Builds things.','{embedded-systems,pcb-design}','{cycling,hardware-prototyping}',true,300,260,10,250,false,'Perfect overlap but ~400 m away. Excluded (out of range).'),
   ('kai','kai.demo@bridge.local','Kai Brooks','Growth Marketer','','','Austin','','{marketing,react}','{startups,cycling}',true,35,-30,10,100,true,'Shares overlap and is close, but you blocked them. Excluded.'),
   ('zoe','zoe.demo@bridge.local','Zoe Adams','Frontend Engineer','','','Austin','','{react,typescript}','{startups}',true,20,20,120,100,false,'Location accuracy 120 m (worse than 50 m). Excluded.'),
   ('ravi','ravi.demo@bridge.local','Ravi Iyer','Backend Engineer','','','Austin','','{typescript,backend}','{cycling}',true,55,55,10,50,false,'~78 m away but their radius is 50 m; smaller radius wins. Excluded.');
  for r in select * from demo.personas loop
    p := pg_temp.mk_user(r.email, r.display_name, 'bridge-demo-persona');
    update public.profiles set is_demo = true, role_title = coalesce(r.role_title,''), company = coalesce(r.company,''), school = coalesce(r.school,''), city = coalesce(r.city,''), bio = coalesce(r.bio,''), onboarding_complete = true where id = p;
    insert into public.profile_tags (owner_id, kind, tag, label) select p, 'skill', t, initcap(replace(t,'-',' ')) from unnest(r.skills) t;
    insert into public.profile_tags (owner_id, kind, tag, label) select p, 'interest', t, initcap(replace(t,'-',' ')) from unnest(r.interests) t;
    insert into public.discovery_prefs (owner_id, enabled, radius_m) values (p, r.nearby_enabled, r.radius_m) on conflict (owner_id) do update set enabled = excluded.enabled, radius_m = excluded.radius_m;
  end loop;
end $$;

-- ---------- ~40 fictional contacts ----------
insert into demo.contacts (key, name, first_name, last_name, email, headline, company, school, location, how_met, met_at, relationship, relationship_source, relationship_status, last_interaction_at, links) values
 ('maya','Maya Chen','Maya','Chen','maya.demo@bridge.local','Firmware Engineer at Lumen Labs','Lumen Labs','State University','Austin, TX','Robotics club at State University; we built a line-following robot together.','2022-09-10','personal','manual','confirmed','2026-10-12','[{"label":"GitHub","url":"https://github.com/example-maya"}]'),
 ('jordan','Jordan Rivera','Jordan','Rivera',null,'Community Lead at Eastside Makerspace','Eastside Makerspace',null,'Austin, TX','Met at the makerspace open house; Jordan runs the Tuesday hardware nights.','2025-03-04','personal','manual','confirmed','2026-09-28','[]'),
 ('priya','Priya Natarajan','Priya','Natarajan',null,'Manufacturing Engineer, consumer electronics','BrightForm Mfg',null,'Austin, TX','Have not met. Jordan mentioned Priya as the person who handles injection molding for small hardware startups.',null,'unknown','note','suggested',null,'[]'),
 ('sam','Sam Okafor','Sam','Okafor',null,'Industrial Designer','Freelance','Design College','Portland, OR','Worked together on a hackathon enclosure in 2024.','2024-02-17','personal','manual','confirmed','2024-05-02','[]'),
 ('lee','Lee Zhang','Lee','Zhang',null,'Computer Vision Researcher','VisionLoop',null,'San Francisco, CA','Follows me on LinkedIn; we have never spoken.',null,'follower','plugin','confirmed',null,'[{"label":"LinkedIn","url":"https://www.linkedin.com/in/example-leezhang"}]'),
 ('ana','Ana Souza','Ana','Souza',null,'Software Engineer','Pixel Robotics',null,'Austin, TX','Met at a Python meetup.','2026-01-20','personal','manual','confirmed','2026-01-20','[]'),
 ('kai','Kai Brooks','Kai','Brooks','kai.demo@bridge.local','Growth Marketer','','','Austin, TX','Met at a startup mixer; unpleasant follow-up, later blocked in Nearby.','2026-04-02','personal','manual','confirmed','2026-04-02','[]'),
 ('tomas','Tomás Herrera','Tomás','Herrera',null,'Electrical Engineer, PCB layout','Volta Boards','Tech Institute','Austin, TX','Maya introduced us at a hardware night.','2025-11-11','personal','manual','confirmed','2026-08-19','[]'),
 ('grace','Grace Liu','Grace','Liu',null,'ML Engineer','Freelance (ex-coworker)',null,'Austin, TX','Former teammate at my last job.','2023-06-01','colleague','manual','confirmed','2026-07-03','[]'),
 ('noah','Noah Bennett','Noah','Bennett',null,'React Native Developer','Appsmith Studio',null,'Remote','Online RN community; paired on a bug bash.','2025-05-21','personal','manual','confirmed','2026-06-15','[]'),
 ('fatima','Fatima Al-Sayed','Fatima','Al-Sayed',null,'UX Researcher','Civic Design Lab','State University','Austin, TX','Same university; worked on an accessibility study together.','2021-10-03','personal','manual','confirmed','2026-03-30','[]'),
 ('marcus','Marcus Hill','Marcus','Hill',null,'Partner','Seed Trail Ventures',null,'Austin, TX','Met at demo day; he gave feedback on a friend''s pitch.','2026-02-11','personal','manual','confirmed','2026-02-11','[]'),
 ('elena','Elena Petrova','Elena','Petrova',null,'Product Manager','Looking for next thing',null,'Austin, TX','Coffee chat via Fatima.','2026-08-01','personal','manual','confirmed','2026-09-20','[]'),
 ('wei','Wei Zhang','Wei','Zhang',null,'Supply Chain Manager','GlowGear',null,'Shenzhen / Austin','Met at hardware meetup; sources components for lighting products.','2025-09-15','personal','manual','confirmed','2026-05-05','[]'),
 ('isabel','Isabel Moreno','Isabel','Moreno',null,'Lighting Designer','Studio Lux',null,'Austin, TX','Neighbor; designs architectural lighting.','2024-11-02','personal','manual','confirmed','2026-09-01','[]'),
 ('kwame','Kwame Mensah','Kwame','Mensah',null,'Transportation Planner','City Mobility Office',null,'Austin, TX','Cycling advocacy meeting.','2025-06-14','personal','manual','confirmed','2026-04-18','[]'),
 ('olivia','Olivia Grant','Olivia','Grant',null,'Cycling club organizer','Hill Country Riders',null,'Austin, TX','Weekend rides.','2023-04-09','personal','manual','confirmed','2026-10-05','[]'),
 ('david','David Cohen','David','Cohen',null,'Startup Attorney','Cohen Legal',null,'Austin, TX','Friend of Marcus; met at a founder dinner.','2026-02-11','personal','manual','confirmed','2026-02-11','[]'),
 ('sofia','Sofia Rossi','Sofia','Rossi',null,'Marketing Lead','Pedal Co',null,'Remote','Met online in a cycling founders forum.','2026-05-10','personal','manual','confirmed','2026-05-10','[]'),
 ('ben','Ben Carter','Ben','Carter',null,'Video Producer','Freelance',null,'Austin, TX','Shot a product video for a friend.','2025-12-01','personal','manual','confirmed','2026-01-15','[]'),
 ('hannah','Hannah Schmidt','Hannah','Schmidt',null,'Accessibility Consultant','Inclusive UX',null,'Berlin','Conference hallway track.','2025-10-20','personal','manual','confirmed','2025-10-20','[]'),
 ('arjun','Arjun Mehta','Arjun','Mehta',null,'Robotics Engineer','Pixel Robotics',null,'Austin, TX','Ana''s coworker; met at the Python meetup.','2026-01-20','personal','manual','confirmed','2026-01-20','[]'),
 ('chloe','Chloe Dubois','Chloe','Dubois',null,'Data Engineer','Streamline',null,'Remote','Former colleague.','2022-01-10','colleague','manual','confirmed','2025-12-12','[]'),
 ('mateo','Mateo Garcia','Mateo','Garcia',null,'Founder','Verde Climate',null,'Austin, TX','Climate tech meetup.','2026-03-12','personal','manual','confirmed','2026-03-12','[]'),
 ('nina','Dr. Nina Patel','Nina','Patel',null,'Medical Device Engineer','CardioSense',null,'Houston, TX','Family friend.','2019-05-05','personal','manual','confirmed','2026-06-01','[]'),
 ('alan','Prof. Alan Wright','Alan','Wright',null,'Professor of Electrical Engineering','State University','State University','Austin, TX','Same university (never took his class).',null,'unknown','csv_import','suggested',null,'[]'),
 ('rachel','Rachel Kim','Rachel','Kim',null,'Technical Recruiter','TalentBridge',null,'Austin, TX','Recruited me once.','2024-08-08','personal','manual','confirmed','2025-11-11','[]'),
 ('victor','Victor Nguyen','Victor','Nguyen',null,'Sales Director','GlowGear',null,'Austin, TX','Wei''s colleague.','2025-09-15','personal','manual','confirmed','2025-09-15','[]'),
 ('ivan','Ivan Petrov','Ivan','Petrov',null,'Backend Engineer','Streamline',null,'Remote','Former colleague.','2022-01-10','colleague','manual','confirmed','2026-02-02','[]'),
 ('amara','Amara Okonkwo','Amara','Okonkwo',null,'DevOps Engineer','CloudNine',null,'Austin, TX','Meetup.','2025-07-07','personal','manual','confirmed','2026-07-07','[]'),
 ('lucas','Lucas Silva','Lucas','Silva',null,'3D Printing Specialist','Eastside Makerspace',null,'Austin, TX','Makerspace Tuesday nights.','2025-04-01','personal','manual','confirmed','2026-09-30','[]'),
 ('emma','Emma Johansson','Emma','Johansson',null,'Mechanical Engineer','Volta Boards',null,'Austin, TX','Tomás''s teammate.','2026-01-05','personal','manual','confirmed','2026-08-19','[]'),
 ('hiro','Hiro Sato','Hiro','Sato',null,'Signal Processing Engineer','SenseWorks',null,'Tokyo','Online hardware forum.','2025-02-02','personal','manual','confirmed','2025-10-10','[]'),
 ('zara','Zara Ahmed','Zara','Ahmed',null,'Technical Writer','Freelance',null,'Austin, TX','Writing workshop.','2025-08-20','personal','manual','confirmed','2026-05-20','[]'),
 ('felix','Felix Wagner','Felix','Wagner',null,'Photographer','Freelance',null,'Austin, TX','Shot headshots.','2025-03-03','personal','manual','confirmed','2025-03-03','[]'),
 ('carmen','Carmen Diaz','Carmen','Diaz',null,'Event Organizer','Austin Hardware Week',null,'Austin, TX','Volunteered at Hardware Week.','2025-10-01','personal','manual','confirmed','2026-10-01','[]'),
 ('oscar','Oscar Lindqvist','Oscar','Lindqvist',null,'Open source maintainer','',null,'Stockholm','GitHub collaboration.','2024-06-06','personal','manual','confirmed','2026-04-04','[]'),
 ('mei','Mei Lin','Mei','Lin',null,'Rust Developer','Ferrous Systems',null,'Remote','Rust meetup online.','2025-11-30','personal','manual','confirmed','2026-03-03','[]'),
 ('jamal','Jamal Washington','Jamal','Washington',null,'Fintech PM','PayFlow',null,'Austin, TX','Mutual friend''s birthday.','2024-12-12','personal','manual','confirmed','2026-01-01','[]'),
 ('tyler','Tyler Brooks','Tyler','Brooks',null,'Game Developer','Indie',null,'Austin, TX','Game jam.','2025-01-18','personal','manual','confirmed','2025-01-18','[]'),
 ('aisha','Aisha Bello','Aisha','Bello',null,'Musician & audio engineer','',null,'Austin, TX','Friend from a concert.','2023-09-09','personal','manual','confirmed','2026-08-08','[]'),
 ('nadia','Nadia Hussain','Nadia','Hussain',null,'QA Lead','Appsmith Studio',null,'Remote','Noah''s colleague.','2026-06-15','personal','manual','confirmed','2026-06-15','[]'),
 ('raj','Raj Patel','Raj','Patel',null,'Hardware Product Manager','Lumen Labs',null,'Austin, TX','Imported from LinkedIn connections export (1st-degree connection). We connected after a conference.','2025-10-18','mutual_connection','plugin','confirmed',null,'[{"label":"LinkedIn","url":"https://www.linkedin.com/in/example-rajpatel"}]'),
 ('dana','Dana Whitfield','Dana','Whitfield',null,'VC Associate','Seed Trail Ventures',null,'Austin, TX','Follows my posts; never interacted.',null,'following','plugin','confirmed',null,'[]');

-- claims: (contact_key, kind, tag, label, status, source, excerpt, observed_at, confidence, url)
insert into demo.claims (contact_key, kind, tag, label, status, source, excerpt, observed_at, confidence, url) values
 ('maya','skill','embedded-systems','Embedded systems','confirmed','note','Maya spent the evening walking me through the ESP32 power budget for the light; she has shipped three firmware products at Lumen.','2026-10-12',1,null),
 ('maya','skill','firmware','Firmware','confirmed','note','She has shipped three firmware products at Lumen.','2026-10-12',1,null),
 ('maya','skill','c-cpp','C/C++','confirmed','manual','Added when creating the contact.','2024-01-05',1,null),
 ('maya','interest','cycling','Cycling','confirmed','note','Maya commutes by bike every day and complained her rear light dies in the rain.','2026-10-12',1,null),
 ('maya','interest','hardware-prototyping','Hardware prototyping','confirmed','manual','','2024-01-05',1,null),
 ('maya','offer','firmware','Offered to review firmware architecture','confirmed','note','Maya offered to review my firmware architecture over a weekend.','2026-10-12',1,null),
 ('jordan','skill','community-building','Community building','confirmed','manual','Runs Eastside Makerspace programming.','2025-03-04',1,null),
 ('jordan','interest','makerspace','Makerspaces','confirmed','manual','','2025-03-04',1,null),
 ('jordan','interest','hardware-prototyping','Hardware prototyping','confirmed','manual','','2025-03-04',1,null),
 ('jordan','goal','event-organizing','Wants speakers for Tuesday hardware nights','confirmed','note','Jordan is looking for people to give short talks at hardware night.','2026-09-28',1,null),
 ('priya','skill','manufacturing','Manufacturing','suggested','note','Jordan said Priya handles injection molding for small hardware startups at BrightForm.','2026-09-28',0.6,null),
 ('priya','skill','injection-molding','Injection molding','suggested','note','Jordan said Priya handles injection molding for small hardware startups at BrightForm.','2026-09-28',0.6,null),
 ('sam','skill','industrial-design','Industrial design','confirmed','note','Sam sketched and CNC-cut the hackathon enclosure in a weekend.','2024-02-18',1,null),
 ('sam','skill','cad','CAD','confirmed','note','Sam modeled the enclosure in Fusion.','2024-02-18',1,null),
 ('sam','interest','hardware-prototyping','Hardware prototyping','confirmed','manual','','2024-02-18',1,null),
 ('lee','skill','computer-vision','Computer vision','confirmed','plugin','LinkedIn headline: Computer Vision Researcher at VisionLoop (imported 2026-09-01).','2026-09-01',0.7,'https://www.linkedin.com/in/example-leezhang'),
 ('ana','skill','python','Python','confirmed','manual','Gave a lightning talk on asyncio.','2026-01-20',1,null),
 ('ana','skill','computer-vision','Computer vision','suggested','ai_suggested','Suggested from note text: "Ana mentioned her team does some camera work for pick-and-place robots." Not confirmed.','2026-01-21',0.45,null),
 ('ana','interest','robotics','Robotics','confirmed','manual','','2026-01-20',1,null),
 ('kai','skill','marketing','Marketing','confirmed','manual','','2026-04-02',1,null),
 ('tomas','skill','pcb-design','PCB design','confirmed','note','Tomás laid out a 4-layer board for Volta''s charger in two weeks.','2026-08-19',1,null),
 ('tomas','skill','electrical-engineering','Electrical engineering','confirmed','manual','','2025-11-11',1,null),
 ('tomas','interest','hardware-prototyping','Hardware prototyping','confirmed','manual','','2025-11-11',1,null),
 ('tomas','interest','cycling','Cycling','confirmed','note','Rode the Veloway loop with Tomás.','2026-08-19',1,null),
 ('grace','skill','machine-learning','Machine learning','confirmed','manual','Built the recommendation model at our old job.','2023-06-01',1,null),
 ('grace','skill','computer-vision','Computer vision','confirmed','note','Grace led the defect-detection camera project at her new client; demoed it to me in July.','2026-07-03',1,null),
 ('grace','skill','python','Python','confirmed','manual','','2023-06-01',1,null),
 ('grace','interest','cycling','Cycling','confirmed','manual','','2023-06-01',1,null),
 ('noah','skill','mobile-development','Mobile development','confirmed','manual','','2025-05-21',1,null),
 ('noah','skill','react','React','confirmed','manual','','2025-05-21',1,null),
 ('noah','skill','typescript','TypeScript','confirmed','manual','','2025-05-21',1,null),
 ('noah','interest','open-source','Open source','confirmed','manual','','2025-05-21',1,null),
 ('fatima','skill','user-research','User research','confirmed','manual','','2021-10-03',1,null),
 ('fatima','skill','ux-design','UX design','confirmed','manual','','2021-10-03',1,null),
 ('fatima','skill','accessibility','Accessibility','confirmed','note','Ran the accessibility study with me.','2026-03-30',1,null),
 ('fatima','interest','cycling','Cycling','confirmed','manual','','2021-10-03',1,null),
 ('marcus','skill','venture-capital','Venture capital','confirmed','manual','','2026-02-11',1,null),
 ('marcus','skill','fundraising','Fundraising','confirmed','manual','','2026-02-11',1,null),
 ('marcus','interest','transportation','Transportation & mobility','confirmed','note','Marcus said Seed Trail is looking at micromobility.','2026-02-11',1,null),
 ('elena','skill','product-management','Product management','confirmed','manual','','2026-08-01',1,null),
 ('elena','interest','startups','Startups','confirmed','manual','','2026-08-01',1,null),
 ('elena','interest','cycling','Cycling','confirmed','note','Elena bikes to the coffee shop.','2026-09-20',1,null),
 ('elena','goal','find-cofounder','Looking for a technical cofounder','confirmed','note','Elena said she wants to start a company and is looking for a technical cofounder, ideally in hardware or mobility.','2026-09-20',1,null),
 ('wei','skill','supply-chain','Supply chain','confirmed','manual','','2025-09-15',1,null),
 ('wei','skill','sourcing','Component sourcing','confirmed','note','Wei sources LEDs and batteries for GlowGear.','2026-05-05',1,null),
 ('wei','skill','manufacturing','Manufacturing','confirmed','manual','','2025-09-15',1,null),
 ('wei','interest','lighting','Lighting design','confirmed','manual','','2025-09-15',1,null),
 ('isabel','skill','lighting','Lighting design','confirmed','manual','','2024-11-02',1,null),
 ('isabel','skill','industrial-design','Industrial design','confirmed','manual','','2024-11-02',1,null),
 ('isabel','interest','cycling','Cycling','confirmed','manual','','2024-11-02',1,null),
 ('kwame','skill','urban-planning','Urban planning','confirmed','manual','','2025-06-14',1,null),
 ('kwame','skill','transportation','Transportation & mobility','confirmed','manual','','2025-06-14',1,null),
 ('kwame','interest','cycling','Cycling','confirmed','manual','','2025-06-14',1,null),
 ('kwame','goal','user-testing','Wants pilot projects for safer cycling','confirmed','note','Kwame wants pilot projects that make night cycling safer.','2026-04-18',1,null),
 ('olivia','skill','community-building','Community building','confirmed','manual','','2023-04-09',1,null),
 ('olivia','skill','event-organizing','Event organizing','confirmed','manual','','2023-04-09',1,null),
 ('olivia','interest','cycling','Cycling','confirmed','manual','','2023-04-09',1,null),
 ('olivia','offer','user-testing','Can recruit riders to test products','confirmed','note','Olivia offered to get club members to test prototypes.','2026-10-05',1,null),
 ('david','skill','legal','Legal','confirmed','manual','','2026-02-11',1,null),
 ('david','interest','startups','Startups','confirmed','manual','','2026-02-11',1,null),
 ('sofia','skill','marketing','Marketing','confirmed','manual','','2026-05-10',1,null),
 ('sofia','skill','branding','Branding','confirmed','manual','','2026-05-10',1,null),
 ('sofia','interest','cycling','Cycling','confirmed','manual','','2026-05-10',1,null),
 ('ben','skill','video-production','Video production','confirmed','manual','','2025-12-01',1,null),
 ('hannah','skill','accessibility','Accessibility','confirmed','manual','','2025-10-20',1,null),
 ('hannah','skill','ux-design','UX design','confirmed','manual','','2025-10-20',1,null),
 ('arjun','skill','robotics','Robotics','confirmed','manual','','2026-01-20',1,null),
 ('arjun','skill','c-cpp','C/C++','confirmed','manual','','2026-01-20',1,null),
 ('arjun','skill','sensors','Sensors','confirmed','manual','','2026-01-20',1,null),
 ('chloe','skill','data-engineering','Data engineering','confirmed','manual','','2022-01-10',1,null),
 ('chloe','skill','python','Python','confirmed','manual','','2022-01-10',1,null),
 ('mateo','skill','startups','Startups','confirmed','manual','','2026-03-12',1,null),
 ('mateo','skill','fundraising','Fundraising','confirmed','note','Mateo closed a pre-seed round in March.','2026-03-12',1,null),
 ('mateo','interest','climate-tech','Climate tech','confirmed','manual','','2026-03-12',1,null),
 ('mateo','interest','sustainability','Sustainability','confirmed','manual','','2026-03-12',1,null),
 ('nina','skill','medical-devices','Medical devices','confirmed','manual','','2019-05-05',1,null),
 ('nina','skill','electrical-engineering','Electrical engineering','confirmed','manual','','2019-05-05',1,null),
 ('alan','skill','electrical-engineering','Electrical engineering','confirmed','csv_import','CSV import: title "Professor of Electrical Engineering".','2026-06-01',0.7,null),
 ('rachel','skill','recruiting','Recruiting','confirmed','manual','','2024-08-08',1,null),
 ('victor','skill','sales','Sales','confirmed','manual','','2025-09-15',1,null),
 ('ivan','skill','backend','Backend engineering','confirmed','manual','','2022-01-10',1,null),
 ('ivan','skill','databases','Databases','confirmed','manual','','2022-01-10',1,null),
 ('amara','skill','cloud','Cloud & DevOps','confirmed','manual','','2025-07-07',1,null),
 ('lucas','skill','3d-printing','3D printing','confirmed','manual','','2025-04-01',1,null),
 ('lucas','skill','cad','CAD','confirmed','manual','','2025-04-01',1,null),
 ('lucas','interest','makerspace','Makerspaces','confirmed','manual','','2025-04-01',1,null),
 ('emma','skill','mechanical-engineering','Mechanical engineering','confirmed','manual','','2026-01-05',1,null),
 ('emma','skill','cad','CAD','confirmed','manual','','2026-01-05',1,null),
 ('emma','interest','cycling','Cycling','confirmed','manual','','2026-01-05',1,null),
 ('hiro','skill','signal-processing','Signal processing','confirmed','manual','','2025-02-02',1,null),
 ('hiro','skill','sensors','Sensors','confirmed','manual','','2025-02-02',1,null),
 ('zara','skill','writing','Writing','confirmed','manual','','2025-08-20',1,null),
 ('felix','skill','photography','Photography','confirmed','manual','','2025-03-03',1,null),
 ('carmen','skill','event-organizing','Event organizing','confirmed','manual','','2025-10-01',1,null),
 ('carmen','interest','hardware-prototyping','Hardware prototyping','confirmed','manual','','2025-10-01',1,null),
 ('oscar','skill','open-source','Open source','confirmed','manual','','2024-06-06',1,null),
 ('oscar','skill','rust','Rust','confirmed','manual','','2024-06-06',1,null),
 ('mei','skill','rust','Rust','confirmed','manual','','2025-11-30',1,null),
 ('mei','skill','systems-programming','Systems programming','confirmed','manual','','2025-11-30',1,null),
 ('jamal','skill','product-management','Product management','confirmed','manual','','2024-12-12',1,null),
 ('jamal','interest','fintech','Fintech','confirmed','manual','','2024-12-12',1,null),
 ('tyler','skill','gaming','Gaming','confirmed','manual','','2025-01-18',1,null),
 ('aisha','skill','music','Music','confirmed','manual','','2023-09-09',1,null),
 ('nadia','skill','qa-testing','QA & testing','confirmed','manual','','2026-06-15',1,null),
 ('raj','skill','product-management','Product management','confirmed','plugin','LinkedIn export: Position "Hardware Product Manager" at Lumen Labs (Connected On 18 Oct 2025).','2026-10-18',0.7,'https://www.linkedin.com/in/example-rajpatel'),
 ('raj','skill','hardware-prototyping','Hardware prototyping','suggested','plugin','Inferred from title; needs confirmation.','2026-10-18',0.4,'https://www.linkedin.com/in/example-rajpatel'),
 ('dana','skill','venture-capital','Venture capital','confirmed','plugin','Imported follower record; title only.','2026-10-18',0.5,null);

-- edges: (from_key null = me)
insert into demo.edges (from_key, to_key, kind, status, source, note, observed_at) values
 ('jordan','priya','knows','confirmed','note','Jordan: "Priya and I go way back, I can intro you whenever."','2026-09-28'),
 ('maya','tomas','introduced','confirmed','manual','Maya introduced me to Tomás.','2025-11-11'),
 ('maya','raj','works_with','confirmed','plugin','Both at Lumen Labs per LinkedIn export (same employer; not confirmed they work together).','2026-10-18'),
 ('ana','arjun','works_with','confirmed','manual','Coworkers at Pixel Robotics.','2026-01-20'),
 ('fatima','elena','introduced','confirmed','manual','Fatima introduced Elena.','2026-08-01'),
 ('marcus','david','knows','confirmed','manual','','2026-02-11'),
 ('marcus','dana','works_with','suggested','plugin','Same firm per LinkedIn.','2026-10-18'),
 ('wei','victor','works_with','confirmed','manual','','2025-09-15'),
 ('tomas','emma','works_with','confirmed','manual','','2026-01-05'),
 ('noah','nadia','works_with','confirmed','manual','','2026-06-15'),
 ('jordan','lucas','works_with','confirmed','manual','','2025-04-01'),
 (null,'dana','followed_by','confirmed','plugin','Dana follows me.','2026-10-18'),
 (null,'alan','same_school','suggested','csv_import','Same school (State University). Not a personal relationship.','2026-06-01');

insert into demo.notes (contact_key, body, captured_via, created_at) values
 ('maya','Coffee with Maya Chen. She spent the evening walking me through the ESP32 power budget for the light; she has shipped three firmware products at Lumen. She commutes by bike every day and complained her rear light dies in the rain. Maya offered to review my firmware architecture over a weekend.','typed','2026-10-12'),
 ('jordan','Hardware night. Jordan Rivera said Priya Natarajan at BrightForm handles injection molding for small hardware startups and offered to intro me whenever. Jordan is looking for people to give short talks at hardware night.','voice','2026-09-28'),
 ('elena','Elena wants to start a company and is looking for a technical cofounder, ideally in hardware or mobility.','typed','2026-09-20'),
 ('sam','Hackathon: Sam sketched and CNC-cut the enclosure in a weekend. Modeled it in Fusion.','typed','2024-02-18'),
 (null,'Ran into Grace at the farmers market; she led a defect-detection camera project for a client and demoed it in July.','voice','2026-07-03');

insert into demo.reminders (contact_key, title, due_in_days) values
 ('maya','Send Maya the firmware repo link', 2),
 ('jordan','Ask Jordan for the Priya intro', 5),
 ('sam','Reconnect with Sam; it has been a while', 7);

-- ---------- plugin registry ----------
insert into public.plugins (id, name, version, description, author, kind, manifest, capabilities, service_url) values
 ('linkedin-export','LinkedIn connections export','1.0.0','Import the Connections.csv you download from LinkedIn (Settings > Data privacy > Get a copy of your data). Marks people as 1st-degree connections, never as personal relationships or experts.','Bridge','builtin',
  '{"id":"linkedin-export","name":"LinkedIn connections export","version":"1.0.0","author":"Bridge","auth":{"type":"file","accept":[".csv"]},"capabilities":["import.people","import.edges"],"relationshipTypes":["mutual_connection"],"limits":{"maxRecords":5000,"maxBytes":5000000},"privacy":"Processed server-side in your account only. Nothing is sent to LinkedIn."}',
  '{import.people,import.edges}', null),
 ('linkedin-api','LinkedIn (official API)','0.1.0','Sign in with LinkedIn to verify your own profile. The public LinkedIn API does not expose your connections list, so this connector cannot import connections; use the export importer for that.','Bridge','builtin',
  '{"id":"linkedin-api","name":"LinkedIn (official API)","version":"0.1.0","author":"Bridge","auth":{"type":"oauth2","scopes":["openid","profile","email"],"pkce":true},"capabilities":["verify.self"],"limits":{"maxRecords":1},"limitations":"Connections, followers and messaging are not available through LinkedIn''s public API."}',
  '{verify.self}', null),
 ('community-example','Example community connector (fixtures)','1.0.0','Reference connector that runs as an isolated HTTP service and returns fixture people and follower edges. Demonstrates provenance, follower vs connection labeling, and identity review.','Bridge community','community',
  '{"id":"community-example","name":"Example community connector (fixtures)","version":"1.0.0","author":"Bridge community","auth":{"type":"none"},"capabilities":["import.people","import.edges"],"relationshipTypes":["follower","following","mutual_connection"],"service":{"url":"http://host.docker.internal:8787","allowedHosts":["host.docker.internal","127.0.0.1"]},"limits":{"maxRecords":500,"maxBytes":1000000,"timeoutMs":8000}}',
  '{import.people,import.edges}', 'http://host.docker.internal:8787');
insert into public.plugin_manifests (plugin_id, version, manifest) select id, version, manifest from public.plugins;
-- ---------- pasted LinkedIn profiles (added on request) ----------
insert into demo.contacts (key, name, first_name, last_name, email, headline, company, school, location, how_met, met_at, relationship, relationship_source, relationship_status, last_interaction_at, links) values
 ('guru','Pranavagurubaran (Guru) Senthilkumar','Pranavagurubaran','Senthilkumar',null,'Aerospace Engineering student at Georgia Tech; UAV autonomy, flight controls, robotics','Georgia Tech','Georgia Tech - Aerospace Engineering','Atlanta, GA','LinkedIn, 2nd-degree; Saumya and Steve are mutual connections. Invitation sent.','2026-10-24','mutual_connection','manual','suggested','2026-10-24','[{"label":"Persimia","url":"https://persimia.com/"}]'),
 ('aadi','Aadi Gala','Aadi','Gala',null,'Georgia Tech ''30 | BofA Student Leader ''25 | Buildspace S5 ''24; CS, math, public speaking','Georgia Institute of Technology','Georgia Institute of Technology','Atlanta, GA','LinkedIn, 2nd-degree; Jake, Aadi and 2 other mutual connections. We both studied at Georgia Tech.','2026-10-24','mutual_connection','manual','suggested','2026-10-24','[]')
on conflict (key) do nothing;
insert into demo.claims (contact_key, kind, tag, label, status, source, excerpt, observed_at, confidence, url) values
 ('guru','skill','computer-vision','Computer vision','confirmed','note','Top skills: Computer Vision, Robotics, CAD, Control Systems Design, AI on Edge (Jetson Orin Nano Super). Led Computer Vision and Automation efforts for FRC Team 2530.','2026-10-24',0.9,null),
 ('guru','skill','robotics','Robotics','confirmed','note','Robotics Lead & Mentor at FIRST since 2021; founded FTC Team 27408; regional win and world championship participation.','2026-10-24',0.9,null),
 ('guru','skill','control-systems','Control systems','confirmed','note','Developed autonomous control systems using cascaded PID for stable GPS loitering (VTOL quadplane, ArduPilot/STM32H7, RTK GPS, 120 min flight).','2026-10-24',0.9,null),
 ('guru','skill','uav','UAV / drones','confirmed','note','UAV Systems & Flight Controls Engineering Intern at Persimia: designed and built a hybrid VTOL quadplane; NDAA-compliant.','2026-10-24',0.9,null),
 ('guru','skill','embedded-systems','Embedded systems','confirmed','note','Currently building a fully actuated 6-DoF omnicopter and exploring aerial robotics, controls, and embedded systems.','2026-10-24',0.8,null),
 ('guru','skill','cad','CAD','confirmed','note','Top skills include Computer-Aided Design (CAD); Science Olympiad build captain, medals in Electric Vehicle, Robot Tour, Optics.','2026-10-24',0.8,null),
 ('guru','skill','python','Python','confirmed','note','Skills listed at RAYSE-MN: Robotics, Python.','2026-10-24',0.7,null),
 ('guru','interest','aerospace','Aerospace engineering','confirmed','note','Exploring aerial robotics, controls, and embedded systems.','2026-10-24',0.8,null),
 ('guru','interest','stem-education','STEM education','confirmed','note','Founded RAYSE-MN Nonprofit to empower youth in Rochester through hands-on robotics and STEM; wrote and obtained grants.','2026-10-24',0.8,null),
 ('guru','interest','conservation','Conservation','confirmed','note','Quadcopter: YOLOv5, 15 fps detection, thermal sensing, autonomous monitoring to conserve endangered bats.','2026-10-24',0.7,null),
 ('guru','org','georgia-tech','Georgia Tech','confirmed','note','Georgia Tech Aerospace Student, Atlanta Metropolitan Area.','2026-10-24',1,null),
 ('guru','org','mayo-clinic','Mayo Clinic','confirmed','note','Biomechanics core Research Intern at Mayo Clinic, Sep 2025 - Jun 2026.','2026-10-24',1,null),
 ('guru','offer','robotics-mentoring','Robotics mentoring','suggested','note','Mentored and provided technical expertise to underserved communities in robotics.','2026-10-24',0.6,null),
 ('aadi','skill','public-speaking','Public speaking','confirmed','note','Used public speaking to advocate for cultural diversity at an event with 250+ in attendance; led our pitch, demo, and expo presentation for net0.','2026-10-24',0.9,null),
 ('aadi','skill','mesh-networking','Mesh networking','confirmed','note','net0 at HackGT 13: low-cost ESP32 devices pass SOS messages node to node. My role: I built the routing nodes that relay messages across the mesh.','2026-10-24',0.8,null),
 ('aadi','skill','python','Python','confirmed','note','Tutored 15 students for the Lockheed Martin Codequest competition, teaching computer logic and Python.','2026-10-24',0.7,null),
 ('aadi','skill','team-management','Team management','confirmed','note','Helped organize and lead a team of 60 people across multiple high schools; manage documentation for 100+ volunteers.','2026-10-24',0.8,null),
 ('aadi','skill','mathematics','Mathematics','confirmed','note','Captain, UHS Mu Alpha Theta; hosting 10+ practice sessions and tutoring problem solving.','2026-10-24',0.7,null),
 ('aadi','interest','hackathons','Hackathons','confirmed','note','We didn''t place at HackGT 13, but I''m prouder of net0 than almost anything I''ve built.','2026-10-24',0.9,null),
 ('aadi','interest','disaster-response','Disaster response tech','confirmed','note','Who else is working on tech for disaster response? I''d love to connect.','2026-10-24',0.9,null),
 ('aadi','interest','volunteering','Volunteering','confirmed','note','VP of Community Service at REACH; Youth Development Intern at Boys & Girls Clubs of Central Florida.','2026-10-24',0.8,null),
 ('aadi','org','georgia-tech','Georgia Tech','confirmed','note','Georgia Institute of Technology ''30.','2026-10-24',1,null),
 ('aadi','org','bank-of-america','Bank of America','confirmed','note','Student Leader, Bank of America, May - Aug 2025.','2026-10-24',1,null),
 ('aadi','goal','open-to-work','Open to work','confirmed','note','Open to work: Orlando, FL +1 more | On-site, Hybrid, Remote.','2026-10-24',0.9,null),
 ('aadi','offer','cs-tutoring','CS tutoring','suggested','note','Co-Founder & Captain, UHS Computer Club: tutoring for AP Computer Science and Codequest.','2026-10-24',0.6,null);
insert into demo.notes (contact_key, body, captured_via, created_at) values
 ('guru','LinkedIn profile, pasted. Aerospace Engineering student at Georgia Tech focused on autonomous systems, UAVs, flight controls, and robotics. Building a fully actuated 6-DoF omnicopter. Projects: VTOL Loiter (quad-plus-pusher, cascaded PID, ArduPilot/STM32H7, RTK GPS, 120 min flight, NDAA-compliant) and a YOLOv5 thermal quadcopter for monitoring endangered bats. Founding President of RAYSE-MN; robotics mentor at FIRST; Mayo Clinic biomechanics intern; Persimia UAV intern. Speaks English and Tamil.','typed','2026-10-24'),
 ('aadi','LinkedIn profile, pasted. Georgia Tech ''30, BofA Student Leader ''25, Buildspace S5 ''24. Built net0 at HackGT 13 with Ishan Patel, Alvy S., and Kshrugal Reddy Jangalapalli: off-grid ESP32 mesh SOS system plus a Gemini-powered dispatch dashboard; Aadi built the routing nodes and led the pitch. Wants to keep working on disaster-response tech (LoRa, offline AI). Open to work; Orlando and Atlanta.','typed','2026-10-24');
insert into demo.edges (from_key, to_key, kind, status, source, note, observed_at) values
 (null,'guru','knows','suggested','manual','LinkedIn 2nd-degree connection; invitation pending, not yet a warm route.','2026-10-24'),
 (null,'aadi','knows','suggested','manual','LinkedIn 2nd-degree; shared school (Georgia Tech) is not a relationship on its own.','2026-10-24');
