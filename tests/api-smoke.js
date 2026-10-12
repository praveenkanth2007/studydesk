const {io}=require('socket.io-client');const B=process.env.BASE||'http://localhost:5000';let ok=0,bad=0;const fails=()=>bad;
const chk=(n,c,x)=>{c?ok++:bad++;console.log((c?'PASS ':'FAIL ')+n+(c?'':'  -> '+JSON.stringify(x)))};
class U{constructor(n){this.n=n;this.ck=''}
 async r(m,p,b,raw){const h={};if(this.ck)h.cookie=this.ck;let body;if(raw)body=raw;else if(b){h['content-type']='application/json';body=JSON.stringify(b)}
  const res=await fetch(B+'/api'+p,{method:m,headers:h,body});const sc=res.headers.get('set-cookie');if(sc)this.ck=sc.split(';')[0];let j=null;try{j=await res.json()}catch{}return{s:res.status,j}}
 get(p){return this.r('GET',p)} post(p,b){return this.r('POST',p,b||{})} put(p,b){return this.r('PUT',p,b)} patch(p,b){return this.r('PATCH',p,b||{})} del(p){return this.r('DELETE',p)}}
const login=async(e)=>{const u=new U(e);const r=await u.post('/auth/login',{email:e+'@demo.neonflow.dev',password:'Password123'});u.me=r.j.user;return u};
(async()=>{
const fac=await login('faculty'),asha=await login('asha'),ben=await login('ben'),admin=await login('admin');
chk('seed logins work',fac.me.role==='faculty'&&asha.me.role==='student'&&admin.me.role==='admin');
// auth
let x=await new U().get('/tasks');chk('unauthenticated -> 401',x.s===401);
x=await new U().post('/auth/login',{email:'asha@demo.neonflow.dev',password:'bad'});chk('wrong password 401',x.s===401);
const nu=new U();const em='new'+Date.now()+'@x.com';
x=await nu.post('/auth/register',{name:'New Student',email:em,password:'Passw0rd1',department:'CSE'});chk('register student',x.s===201&&x.j.user.role==='student');nu.me=x.j.user;
x=await new U().post('/auth/register',{name:'Dup',email:em,password:'Passw0rd1'});chk('duplicate email 409',x.s===409);
x=await new U().post('/auth/register',{name:'Fac One',email:'f'+Date.now()+'@x.com',password:'Passw0rd1',role:'faculty',faculty_code:'wrong'});chk('faculty needs valid code',x.s===403);
x=await new U().post('/auth/register',{name:'F2',email:'f2'+Date.now()+'@x.com',password:'Passw0rd1',role:'faculty',faculty_code:'fac-code-123'});chk('faculty with code ok',x.s===201&&x.j.user.role==='faculty');
x=await new U().post('/auth/register',{name:'A',email:'a'+Date.now()+'@x.com',password:'Passw0rd1',role:'admin'});chk('cannot self-register admin',x.s===400);
const rawc=(await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'asha@demo.neonflow.dev',password:'Password123'})})).headers.get('set-cookie');chk('cookie is HttpOnly + SameSite',/HttpOnly/i.test(rawc)&&/SameSite=Lax/i.test(rawc));
// tasks
x=await asha.post('/tasks',{title:'',due_at:'bad'});chk('task validation 400',x.s===400&&x.j.fields.title);
const due=new Date(Date.now()+864e5).toISOString();
x=await asha.post('/tasks',{title:'Write report',priority:'high',category:'Algorithms',due_at:due,est_minutes:90,notes:'private note'});chk('create task',x.s===201&&x.j.task.status==='todo');const tid=x.j.task.id;
x=await asha.patch('/tasks/'+tid+'/status',{status:'in_progress',position:5});chk('drag to in_progress',x.s===200&&x.j.task.status==='in_progress');
x=await asha.post('/tasks/'+tid+'/subtasks',{title:'Outline'});chk('add subtask',x.s===201);const sid=x.j.subtask.id;
x=await asha.patch('/subtasks/'+sid,{done:true});chk('toggle subtask',x.j.subtask.done===true);
x=await asha.get('/tasks/'+tid);chk('task detail has subtasks',x.j.subtasks.length===1);
x=await ben.get('/tasks/'+tid);chk('PRIVACY: other student cannot read my task',x.s===404);
x=await ben.put('/tasks/'+tid,{title:'hacked'});chk('other student cannot edit',x.s===404);
x=await ben.del('/tasks/'+tid);chk('other student cannot delete',x.s===404);
x=await ben.patch('/subtasks/'+sid,{done:false});chk('other student cannot touch subtask',x.s===404);
x=await ben.get('/tasks');chk('ben list excludes asha tasks',!x.j.tasks.some(t=>t.id===tid));
x=await asha.get('/tasks?status=overdue');chk('overdue filter (seeded overdue)',x.j.tasks.length>=1&&x.j.tasks.every(t=>t.status!=='completed'));
x=await asha.get('/tasks?q=report');chk('search',x.j.tasks.length===1);
x=await asha.get("/tasks?q=%25");chk('LIKE wildcard escaped',x.j.tasks.length===0);
x=await asha.get("/tasks?category=x'%20OR%201=1--");chk('SQLi attempt harmless',x.s===200&&x.j.tasks.length===0);
x=await asha.get('/teams');const classTeam=x.j.teams.find(t=>t.kind==='class'),grp=x.j.teams.find(t=>t.kind==='study_group');chk('asha sees 2 teams, no invite code on class',x.j.teams.length===2&&!classTeam.invite_code&&grp.invite_code);
// sharing
x=await asha.put('/tasks/'+tid+'/share',{team_id:grp.id});chk('share task to my team',x.s===200&&x.j.task.shared_team_id===grp.id);
x=await ben.get('/teams/'+grp.id+'/tasks');chk('teammate sees shared task',x.j.tasks.some(t=>t.id===tid)&&!('notes' in x.j.tasks[0]));
x=await asha.put('/tasks/'+tid+'/share',{team_id:'00000000-0000-4000-8000-000000000000'});chk('cannot share to foreign team',x.s===404);
// teams
x=await nu.post('/teams/join',{code:'NOPE123456'});chk('bad invite code 404',x.s===404);
x=await nu.post('/teams/join',{code:'demo2026aa'});chk('join with invite code',x.s===200);
x=await nu.post('/teams/join',{code:'DEMO2026AA'});chk('join twice 409',x.s===409);
x=await nu.get('/teams/'+classTeam.id);chk('new member sees team, members, channels',x.s===200&&x.j.channels.length>=3&&x.j.members.length>=5&&!x.j.team.invite_code);
x=await nu.post('/teams/'+classTeam.id+'/channels',{name:'Hack'});chk('member cannot create channel',x.s===403);
x=await fac.post('/teams/'+classTeam.id+'/channels',{name:'Unit Tests'});chk('faculty creates channel',x.s===201);
x=await fac.post('/teams/'+classTeam.id+'/channels',{name:'Unit Tests'});chk('duplicate channel 409',x.s===409);
x=await nu.post('/teams',{name:'Class',kind:'class'});chk('student cannot create class',x.s===403);
x=await nu.post('/teams',{name:'My Group',kind:'study_group'});chk('student creates study group (+owner,+2 channels)',x.s===201);const ng=x.j.team.id;
x=await ben.get('/teams/'+ng);chk('PRIVACY: non-member cannot open team',x.s===404);
x=await ben.post('/teams/'+classTeam.id+'/invite-code');chk('member cannot regenerate code',x.s===403);
x=await fac.post('/teams/'+classTeam.id+'/invite-code');chk('faculty regenerates code',x.s===200&&x.j.invite_code.length===10);
x=await fac.post('/teams/'+classTeam.id+'/invite',{email:'chen@demo.neonflow.dev'});chk('invite existing member 409',x.s===409);
x=await nu.del('/teams/'+ng+'/members/'+nu.me.id);chk('owner cannot leave own team',x.s===400);
// chat + sockets
const tm=await asha.get('/teams/'+classTeam.id);const gen=tm.j.channels.find(c=>c.kind==='general'),ann=tm.j.channels.find(c=>c.kind==='announcements');
x=await ben.get('/channels/'+gen.id+'/messages');chk('member reads channel history (seeded)',x.s===200&&x.j.messages.length>=2);
const outsider=await login('chen');const g2=await outsider.get('/teams');
const sA=io(B,{extraHeaders:{cookie:asha.ck},transports:['websocket']}),sBad=io(B,{transports:['websocket'],reconnection:false});
const got=[],gotN=[],presence=[];sA.on('message:new',m=>got.push(m));sA.on('notification:new',n=>gotN.push(n));sA.on('presence',p=>presence.push(p));
const badErr=await new Promise(r=>{sBad.on('connect_error',e=>r(e.message));setTimeout(()=>r('timeout'),3000)});chk('socket rejects unauthenticated',badErr==='unauthorized',badErr);
await new Promise(r=>sA.connected?r():sA.on('connect',r));await new Promise(r=>setTimeout(r,300));
x=await ben.post('/channels/'+gen.id+'/messages',{body:'Real-time hello from Ben'});chk('post channel message',x.s===201);const mid=x.j.message.id;
await new Promise(r=>setTimeout(r,500));chk('SOCKET: asha got message:new live',got.some(m=>m.id===mid));
x=await ben.post('/channels/'+gen.id+'/messages',{body:'thread reply',parent_id:mid});chk('thread reply',x.s===201);
x=await asha.get('/messages/'+mid+'/thread');chk('thread fetch',x.j.messages.length===2);
x=await asha.get('/channels/'+gen.id+'/messages?q=real-time');chk('message search',x.j.messages.length>=1);
x=await asha.post('/channels/'+ann.id+'/messages',{body:'student announcing'});chk('student cannot post announcement',x.s===403);
x=await fac.post('/channels/'+ann.id+'/messages',{body:'Midterm on Friday!'});chk('faculty posts announcement',x.s===201);
await new Promise(r=>setTimeout(r,500));chk('SOCKET: announcement notification pushed',gotN.some(n=>n.type==='announcement'));
x=await outsider.get('/channels/'+gen.id+'/messages');chk('chen (member) ok but...',x.s===200);
const stranger=new U();await stranger.post('/auth/register',{name:'Stranger',email:'s'+Date.now()+'@x.com',password:'Passw0rd1'});
x=await stranger.get('/channels/'+gen.id+'/messages');chk('PRIVACY: non-member cannot read channel',x.s===404);
x=await stranger.post('/channels/'+gen.id+'/messages',{body:'spam'});chk('non-member cannot post',x.s===404);
x=await stranger.post('/dm/'+asha.me.id+'/messages',{body:'hi'});chk('cannot DM someone with no shared team',x.s===404);
x=await ben.post('/dm/'+asha.me.id+'/messages',{body:'Hey Asha, DM test'});chk('DM send',x.s===201);
await new Promise(r=>setTimeout(r,400));chk('SOCKET: DM delivered live',got.some(m=>m.recipient_id===asha.me.id));
x=await asha.get('/chat/overview');const dmb=x.j.dms.find(d=>d.user_id===ben.me.id);chk('overview: DM unread=1, channel unread tracked',dmb&&dmb.unread===1&&x.j.channels.length>=3);
x=await asha.get('/badges');chk('badges: chat unread>0',x.j.chat>0);
x=await asha.get('/dm/'+ben.me.id+'/messages');chk('read DM marks read',x.j.messages.length===1);
x=await asha.get('/chat/overview');chk('DM unread cleared',x.j.dms.find(d=>d.user_id===ben.me.id).unread===0);
const sB=io(B,{extraHeaders:{cookie:ben.ck},transports:['websocket']});await new Promise(r=>sB.connected?r():sB.on('connect',r));await new Promise(r=>setTimeout(r,300));chk('SOCKET: presence event',presence.some(p=>p.user_id===ben.me.id&&p.online));
// assignments
x=await asha.post('/assignments',{team_id:classTeam.id,title:'Nope',due_at:due});chk('student cannot create assignment',x.s===403);
x=await fac.post('/assignments',{team_id:classTeam.id,title:'',due_at:'x'});chk('assignment validation',x.s===400);
x=await fac.post('/assignments',{team_id:classTeam.id,title:'Midterm Project',instructions:'Design a schema for a hospital.\nImplement the tables in SQL.\nInclude 5 sample queries.\nSubmit a PDF report.',subject:'DBMS',priority:'high',due_at:new Date(Date.now()+5*864e5).toISOString(),max_marks:40,recipient_ids:[asha.me.id,ben.me.id]});chk('faculty creates assignment for 2 students',x.s===201&&x.j.recipients===2);const aid=x.j.assignment.id;
x=await outsider.get('/assignments/'+aid);chk('PRIVACY: non-recipient student cannot open assignment',x.s===404);
x=await asha.get('/assignments');chk('asha list includes it w/ status assigned',x.j.assignments.find(a=>a.id===aid)?.my_status==='assigned');
x=await asha.get('/notifications');chk('recipient notified',x.j.notifications.some(n=>n.title.includes('Midterm Project')));
x=await asha.patch('/assignments/'+aid+'/progress');chk('student marks in progress',x.s===200);
x=await asha.post('/assignments/'+aid+'/submit',{});chk('empty submission rejected',x.s===400);
x=await ben.post('/tasks',{title:'Linked',assignment_id:aid,due_at:due});chk('student links personal task to assignment',x.s===201);
x=await outsider.post('/tasks',{title:'Linked',assignment_id:aid});chk('cannot link to assignment you do not have',x.s===400);
x=await asha.post('/assignments/'+aid+'/submit',{content:'My answer text'});chk('submit (on time)',x.s===200&&x.j.is_late===false);
x=await asha.post('/assignments/'+aid+'/submit',{content:'again'});chk('double submit 409',x.s===409);
x=await asha.post('/assignments/'+aid+'/students/'+asha.me.id+'/grade',{action:'grade',marks:10});chk('student cannot grade',x.s===403);
x=await fac.post('/assignments/'+aid+'/students/'+asha.me.id+'/review');chk('faculty -> under review',x.s===200);
x=await fac.post('/assignments/'+aid+'/students/'+asha.me.id+'/grade',{action:'grade',marks:99});chk('marks > max rejected',x.s===400&&x.j.fields.marks);
x=await fac.post('/assignments/'+aid+'/students/'+asha.me.id+'/grade',{action:'return',feedback:''});chk('return needs feedback',x.s===400);
x=await fac.post('/assignments/'+aid+'/students/'+asha.me.id+'/grade',{action:'return',feedback:'Add normalization steps.'});chk('return for corrections',x.s===200&&x.j.status==='returned');
x=await asha.post('/assignments/'+aid+'/submit',{content:'Fixed answer'});chk('resubmit after return',x.s===200);
x=await fac.post('/assignments/'+aid+'/students/'+asha.me.id+'/grade',{action:'grade',marks:36.5,feedback:'Good work'});chk('grade',x.s===200&&x.j.status==='graded');
x=await asha.get('/assignments/'+aid);chk('student sees marks+feedback+status graded',x.j.my_status==='graded'&&Number(x.j.submission.marks)===36.5&&x.j.submission.attempt===2);
x=await fac.get('/assignments/'+aid);chk('faculty sees recipients table',x.j.staff&&x.j.recipients.length===2&&x.j.recipients.find(r=>r.name==='Asha Rao').status==='graded');
x=await ben.get('/assignments/'+aid);chk('ben cannot see asha submission',x.j.staff===false&&!x.j.recipients);
x=await ben.post('/assignments/'+aid+'/comments',{body:'Is 3NF enough?'});chk('student comments',x.s===201);
x=await asha.get('/assignments/'+aid+'/comments');chk('comments visible to recipients',x.j.comments.length===1);
x=await outsider.get('/assignments/'+aid+'/comments');chk('PRIVACY: outsider cannot read comments',x.s===404);
x=await fac.get('/notifications');chk('faculty notified of submission+comment',x.j.notifications.some(n=>n.type==='submission')&&x.j.notifications.some(n=>n.type==='comment'));
// files
const fd=new FormData();fd.append('file',new Blob(['hello pdf'],{type:'application/pdf'}),'report.pdf');fd.append('purpose','team');fd.append('team_id',grp.id);
let res=await fetch(B+'/api/files',{method:'POST',headers:{cookie:asha.ck},body:fd});let j=await res.json();chk('upload team file',res.status===201&&j.file.original_name==='report.pdf');const fid=j.file.id;
res=await fetch(B+'/api/files/'+fid+'/download',{headers:{cookie:ben.ck}});chk('teammate downloads file',res.status===200&&(await res.text())==='hello pdf'&&res.headers.get('content-disposition').includes('attachment'));
res=await fetch(B+'/api/files/'+fid+'/download',{headers:{cookie:outsider.ck}});chk('PRIVACY: outsider cannot download',res.status===404);
const badf=new FormData();badf.append('file',new Blob(['x']),'evil.exe');badf.append('purpose','personal');res=await fetch(B+'/api/files',{method:'POST',headers:{cookie:asha.ck},body:badf});chk('.exe upload blocked',res.status===400);
const big=new FormData();big.append('file',new Blob([Buffer.alloc(11*1024*1024)]),'big.pdf');big.append('purpose','personal');res=await fetch(B+'/api/files',{method:'POST',headers:{cookie:asha.ck},body:big});chk('oversize upload blocked',res.status===400);
const sf=new FormData();sf.append('file',new Blob(['answer']),'answer.pdf');sf.append('purpose','submission');sf.append('assignment_id',aid);res=await fetch(B+'/api/files',{method:'POST',headers:{cookie:ben.ck},body:sf});j=await res.json();chk('student uploads submission file',res.status===201);const sfid=j.file.id;
x=await ben.post('/assignments/'+aid+'/submit',{file_id:sfid});chk('submit with file',x.s===200);
res=await fetch(B+'/api/files/'+sfid+'/download',{headers:{cookie:fac.ck}});chk('faculty downloads submission',res.status===200);
res=await fetch(B+'/api/files/'+sfid+'/download',{headers:{cookie:asha.ck}});chk('PRIVACY: classmate cannot download my submission',res.status===404);
x=await asha.get('/files');chk('files list',x.j.files.some(f=>f.id===fid));
// insights / ai
x=await asha.get('/dashboard?tz=Asia/Kolkata');chk('dashboard real counts',x.s===200&&x.j.counts.total>=4&&x.j.upcoming.length>0&&x.j.weekly.length===7);
x=await asha.get('/analytics?tz=Asia/Kolkata');chk('analytics',x.s===200&&x.j.weekly.length===8&&x.j.teams.length>=2&&x.j.submissions.length>=1);
x=await fac.get('/analytics');chk('faculty analytics shows received submissions',x.j.staff&&x.j.submissions.length>=2);
x=await asha.get('/calendar');chk('calendar has tasks+assignments',x.j.tasks.length>0&&x.j.assignments.length>0);
x=await asha.get('/search?q=report');chk('global search',x.s===200&&x.j.tasks.length>=1);
x=await asha.get('/ai/next');chk('AI next task',x.j.task&&x.j.task.reasons.length>0);
x=await asha.get('/ai/schedule?hours=3&tz=Asia/Kolkata');chk('AI schedule',x.j.slots.length>0&&x.j.slots[0].start==='09:00');
x=await asha.get('/ai/conflicts');chk('AI conflicts',Array.isArray(x.j.days));
x=await asha.get('/ai/report');chk('AI weekly report',typeof x.j.summary==='string'&&x.j.summary.length>20);
x=await asha.post('/ai/summarize',{assignment_id:aid});chk('AI summarize',x.j.key_points.length>0);
x=await asha.post('/ai/breakdown',{assignment_id:aid,apply:true});chk('AI breakdown creates linked tasks',x.s===201&&x.j.created>=4);
x=await fac.post('/ai/breakdown',{assignment_id:aid,apply:true});chk('faculty cannot apply breakdown',x.s===403);
x=await asha.post('/ai/chat',{message:'What should I do next?'});chk('AI chat (rules fallback)',x.j.source==='rules'&&x.j.reply.length>10);
// admin
x=await asha.get('/admin/users');chk('student blocked from admin',x.s===403);
x=await admin.get('/admin/users');chk('admin lists users',x.s===200&&x.j.users.length>=5);
x=await admin.get('/teams');chk('admin sees all teams',x.j.teams.length>=3);
// profile/theme
x=await asha.put('/auth/profile',{theme:'light',daily_goal:5});chk('profile theme+goal saved',x.j.user.theme==='light'&&x.j.user.daily_goal===5);
x=await asha.put('/auth/password',{current_password:'wrong',new_password:'NewPass123'});chk('wrong current pw rejected',x.s===400);
// CSRF origin
const cr=await fetch(B+'/api/tasks',{method:'POST',headers:{cookie:asha.ck,'content-type':'application/json',origin:'https://evil.example'},body:JSON.stringify({title:'x'})});chk('cross-origin POST blocked',cr.status===403);
// delete
x=await asha.del('/tasks/'+tid);chk('delete task',x.s===200);
x=await asha.post('/auth/logout');chk('logout',x.s===200);
console.log(`\n${ok} passed, ${fails()} failed`);sA.close();sB.close();process.exit(fails()?1:0)})().catch(e=>{console.log('SCRIPT ERROR',e);process.exit(1)})
