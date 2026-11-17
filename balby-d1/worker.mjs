const PREFIX = '/api/balby';
const COOKIE = '__Host-balby_session';
const enc = new TextEncoder();
const maxFile = 10485760;
const ownAreas = new Set(['dados','atendimento','medidas','saude','habitos','rotina']);
const staffAreas = new Set(['protocolo','solicitacao']);
const entryAreas = new Set(['exames','mensagens','fotos-medidas','fotos-rotina','fotos-checkin']);
class Failure extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
function check(value,status,message) { if (!value) throw new Failure(status,message); }
function json(value,status=200,headers={}) {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
}
function sql(db,text,...args) { return db.prepare(text).bind(...args); }
async function all(db,text,...args) { return (await sql(db,text,...args).all()).results; }
function audit(db,user,action,target=null) {
  return sql(db,'INSERT INTO bt_audit(actor_id,action,subject_id) VALUES (?,?,?)',user,action,target);
}
const hex = bytes => Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
function equal(a,b) {
  if (typeof a!=='string'||typeof b!=='string'||a.length!==b.length) return false;
  let difference=0;
  for(let i=0;i<a.length;i++) difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
}
async function passwordHash(password,salt=token()) {
  check(typeof password==='string'&&password.length>=10&&password.length<=128,400,'Use senha entre 10 e 128 caracteres.');
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:enc.encode(salt)},key,256);
  return 'pbkdf2-sha256$100000$'+salt+'$'+hex(bits);
}
async function passwordValid(password,hash) {
  if(typeof password!=='string'||password.length<10||password.length>128) return false;
  const parts=hash.split('$');
  if(parts.length!==4||parts[0]!=='pbkdf2-sha256'||parts[1]!=='100000') return false;
  return equal(await passwordHash(password,parts[2]),hash);
}
function emailValue(value) {
  const email=String(value||'').trim().toLowerCase();
  check(email.length<=160&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),400,'Informe um e-mail válido.');
  return email;
}
function objectValue(value) {
  check(value&&typeof value==='object'&&!Array.isArray(value),400,'Dados inválidos.');
  check(enc.encode(JSON.stringify(value)).length<=64000,413,'Registro acima do limite.');
  return value;
}
function nameValue(value) {
  check(typeof value==='string'&&value.trim()&&value.length<=120,400,'Informe o nome.');
  return value.trim();
}
function dayValue(day) {
  check(typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day,400,'Data inválida.');
  return day;
}
async function bodyJson(request) {
  check(request.headers.get('Content-Type')?.startsWith('application/json'),415,'Envie JSON.');
  const bytes=await request.arrayBuffer();
  check(bytes.byteLength<=100000,413,'Dados acima do limite.');
  try { return objectValue(JSON.parse(new TextDecoder().decode(bytes))); }
  catch(error) { if(error instanceof Failure)throw error;throw new Failure(400,'JSON inválido.'); }
}
function admin(user) { check(user.role==='admin',403,'Ação exclusiva do AD1.'); }
async function limit(request,db,area) {
  const now=Date.now();
  const bucket=await digest((request.headers.get('CF-Connecting-IP')||'local')+area+Math.floor(now/900000));
  await sql(db,'INSERT INTO bt_login_attempts(bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1',bucket,now+900000).run();
  const row=await sql(db,'SELECT attempts FROM bt_login_attempts WHERE bucket=?',bucket).first();
  check(row.attempts<=30,429,'Muitas tentativas. Aguarde 15 minutos.');
  await sql(db,'DELETE FROM bt_login_attempts WHERE expires_at<?',now).run();
}
async function session(request,db) {
  const cookie=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!cookie||!/^[a-f0-9]{64}$/.test(cookie))return null;
  return sql(db,'SELECT u.*,s.csrf,s.token_hash FROM bt_sessions s JOIN bt_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.enabled=1',await digest(cookie),Date.now()).first();
}
async function login(db,user,remember) {
  const value=token(),csrf=token(),duration=remember?2592000000:43200000;
  await db.batch([
    sql(db,'DELETE FROM bt_sessions WHERE expires_at<?',Date.now()),
    sql(db,'INSERT INTO bt_sessions(token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?)',await digest(value),user.id,csrf,Date.now()+duration),
    audit(db,user.id,'login',user.id)
  ]);
  return json({email:user.email,csrf},200,{'Set-Cookie':COOKIE+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict'+(remember?'; Max-Age='+duration/1000:'')});
}
async function target(db,viewer,email) {
  const user=await sql(db,'SELECT * FROM bt_users WHERE email=?',emailValue(email)).first();
  check(user,404,'Cadastro não encontrado.');
  if(viewer.role==='admin'||viewer.id===user.id)return user;
  check(viewer.role==='professor'&&user.role==='aluno'&&await sql(db,'SELECT 1 FROM bt_teacher_students WHERE teacher_id=? AND student_id=?',viewer.id,user.id).first(),403,'Acesso não autorizado.');
  return user;
}
async function accountsFor(db,viewer) {
  const users=await all(db,"SELECT u.* FROM bt_users u WHERE ?='admin' OR u.id=? OR (?='professor' AND EXISTS(SELECT 1 FROM bt_teacher_students t WHERE t.teacher_id=? AND t.student_id=u.id))",viewer.role,viewer.id,viewer.role,viewer.id);
  const links=await all(db,"SELECT t.student_id,u.email FROM bt_teacher_students t JOIN bt_users u ON t.teacher_id=u.id WHERE ?='admin' OR t.teacher_id=? OR t.student_id=?",viewer.role,viewer.id,viewer.id);
  return Object.fromEntries(users.map(u=>[u.email,{...JSON.parse(u.profile),name:u.name,role:u.role,recordId:u.id,enabled:Boolean(u.enabled),version:u.version,professores:links.filter(l=>l.student_id===u.id).map(l=>l.email)}]));
}
async function bootstrap(db,user) {
  const accounts=await accountsFor(db,user);
  const memory={'.accounts':accounts},versions={};
  for(const id of Object.values(accounts).map(a=>a.recordId)) {
    for(const d of await all(db,'SELECT area,content,version FROM bt_documents WHERE user_id=?',id)) {
      const key='.ficha.'+d.area+'.'+id; memory[key]=JSON.parse(d.content);versions[key]=d.version;
    }
    const daily=await all(db,'SELECT day,content,version FROM bt_daily WHERE user_id=?',id);
    memory['.records.'+id]=Object.fromEntries(daily.map(d=>[d.day,JSON.parse(d.content)]));
    for(const d of daily)versions['.records.'+id+'.'+d.day]=d.version;
  }
  const finance=await sql(db,'SELECT content,version FROM bt_finance WHERE singleton=1').first();
  if(user.role==='admin'&&finance){memory['.financeiro-v1']=JSON.parse(finance.content);versions['.financeiro-v1']=finance.version;}
  const payments=finance?JSON.parse(finance.content).acordos.filter(a=>user.role==='admin'||a.aluno===user.email):[];
  return {user:user.email,csrf:user.csrf,memory,versions,payments};
}
async function documentSave(db,user,body,daily=false) {
  const pupil=await target(db,user,body.email);
  check(pupil.role==='aluno',400,'Escolha um aluno.');
  check(Number.isSafeInteger(body.version)&&body.version>=0,400,'Versão inválida.');
  let key=body.area,content=objectValue(body.content||body.changes);
  let table='bt_documents',column='area';
  if(daily) {
    key=dayValue(body.day);table='bt_daily';column='day';
    check(key<=new Date().toISOString().slice(0,10),400,'Data futura.');
    const allowed=user.id===pupil.id?['blocks','completed','tasks','checkin']:user.role==='admin'?['instruction','reply','assessment']:['assessment'];
    check(Object.keys(content).length&&Object.keys(content).every(k=>allowed.includes(k)),403,'Campo não autorizado.');
    if(content.assessment)content.assessment={...objectValue(content.assessment),author:user.name};
    const old=await sql(db,'SELECT content FROM bt_daily WHERE user_id=? AND day=?',pupil.id,key).first();
    content={...JSON.parse(old?.content||'{}'),...content};
  } else {
    check(ownAreas.has(key)||staffAreas.has(key),400,'Área inválida.');
    check(ownAreas.has(key)?user.id===pupil.id||user.role==='admin':user.role!=='aluno',403,'Ação não autorizada.');
    if(key==='dados') {
      if(content.nascimento)check(dayValue(content.nascimento)<=new Date().toISOString().slice(0,10),400,'Nascimento futuro.');
      content.email=pupil.email;
    }
    if(key==='protocolo'&&content.sala)check(/^https:\/\//.test(content.sala),400,'Use link HTTPS.');
  }
  const result=body.version===0
    ? await sql(db,'INSERT INTO '+table+'(user_id,'+column+',content,version) VALUES (?,?,?,1) ON CONFLICT(user_id,'+column+') DO NOTHING',pupil.id,key,JSON.stringify(content)).run()
    : await sql(db,'UPDATE '+table+" SET content=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND "+column+'=? AND version=?',JSON.stringify(content),pupil.id,key,body.version).run();
  check(result.meta.changes===1,409,'Esse registro mudou em outro aparelho. Recarregue antes de salvar.');
  await audit(db,user.id,daily?'registro_diario':'ficha_'+key,pupil.id).run();
  return json({version:body.version+1,content});
}
async function teachers(db,emails) {
  check(Array.isArray(emails)&&emails.length<=30,400,'Vínculos inválidos.');
  const ids=[];
  for(const email of new Set(emails)) {
    const row=await sql(db,"SELECT id FROM bt_users WHERE email=? AND enabled=1 AND role='professor'",emailValue(email)).first();
    check(row,400,'Professor inválido.');ids.push(row.id);
  }
  return ids;
}
async function userSave(db,viewer,body,create) {
  admin(viewer);
  const email=emailValue(body.email),name=nameValue(body.name);
  const profileKeys=['nascimento','endereco','telefone','emergencia','genero','altura','peso','modalidades','classe'];
  const old=create?null:await target(db,viewer,email);
  check(create?['aluno','professor'].includes(body.role):old.role!=='admin',403,'Perfil não autorizado.');
  const profile={...JSON.parse(old?.profile||'{}')};
  for(const key of profileKeys)if(Object.hasOwn(body,key))profile[key]=body[key];
  const links=await teachers(db,body.professores||[]);
  const id=old?.id||crypto.randomUUID();
  const items=[];
  if(create)items.push(sql(db,'INSERT INTO bt_users(id,email,name,role,password_hash,profile) VALUES (?,?,?,?,?,?)',id,email,name,body.role,await passwordHash(body.password),JSON.stringify(profile)));
  else {
    check(Number.isSafeInteger(body.version),400,'Versão inválida.');
    // The guard makes concurrent profile/link changes abort the entire batch.
    items.push(sql(db,'INSERT INTO bt_version_guards(user_id,expected_version) VALUES (?,?)',id,body.version));
    items.push(sql(db,'UPDATE bt_users SET name=?,enabled=?,profile=?,version=version+1 WHERE id=?',name,body.enabled===false?0:1,JSON.stringify(profile),id));
    items.push(sql(db,'DELETE FROM bt_teacher_students WHERE student_id=?',id));
    items.push(sql(db,'DELETE FROM bt_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM bt_users WHERE id=? AND enabled=0)',id,id));
  }
  items.push(...links.map(t=>sql(db,'INSERT INTO bt_teacher_students(teacher_id,student_id) VALUES (?,?)',t,id)));
  if(!create)items.push(sql(db,'DELETE FROM bt_version_guards WHERE user_id=?',id));
  items.push(audit(db,viewer.id,create?'cadastro_criado':'cadastro_atualizado',id));
  await db.batch(items);
  return json({accounts:await accountsFor(db,viewer)},create?201:200);
}
async function inviteCreate(db,user,body) {
  admin(user);
  const email=emailValue(body.email),name=nameValue(body.name),code=token().slice(0,24).toUpperCase();
  check(!await sql(db,'SELECT id FROM bt_users WHERE email=?',email).first(),409,'Conta já cadastrada.');
  await db.batch([
    sql(db,'INSERT INTO bt_invites(email,name,code_hash,expires_at,invited_by) VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,code_hash=excluded.code_hash,expires_at=excluded.expires_at,invited_by=excluded.invited_by',email,name,await digest(code),Date.now()+604800000,user.id),
    audit(db,user.id,'convite_criado',email)
  ]);
  return json({email,code});
}
async function inviteAccept(request,db,body) {
  await limit(request,db,'convite');
  const email=emailValue(body.email);
  const hash=await digest(String(body.codigo||'').toUpperCase());
  const invite=await sql(db,'SELECT * FROM bt_invites WHERE email=? AND code_hash=? AND expires_at>?',email,hash,Date.now()).first();
  check(invite,400,'Convite inválido ou expirado.');
  const id=crypto.randomUUID(),password=await passwordHash(body.password);
  await db.batch([
    sql(db,"INSERT INTO bt_users(id,email,name,role,password_hash) SELECT ?,email,name,'aluno',? FROM bt_invites WHERE email=? AND code_hash=? AND expires_at>?",id,password,email,hash,Date.now()),
    sql(db,'INSERT INTO bt_invite_guards(user_id) VALUES (?)',id),
    sql(db,'DELETE FROM bt_invites WHERE email=?',email),
    sql(db,'DELETE FROM bt_invite_guards WHERE user_id=?',id),
    audit(db,id,'convite_aceito',id)
  ]);
  return login(db,{id,email},false);
}
async function entryRoute(request,db,user,url) {
  const area=url.searchParams.get('area');
  check(entryAreas.has(area),400,'Área inválida.');
  const pupil=await target(db,user,url.searchParams.get('email')||user.email);
  check(pupil.role==='aluno',400,'Escolha um aluno.');
  if(request.method==='GET') {
    const records=await all(db,'SELECT e.id,e.content,e.created_at,f.id AS file_id,f.name,f.media_type,f.byte_length FROM bt_entries e LEFT JOIN bt_files f ON f.entry_id=e.id WHERE e.user_id=? AND e.area=? ORDER BY e.created_at,e.id',pupil.id,area);
    return json({records:records.map(r=>({...JSON.parse(r.content),id:r.id,criado:r.created_at,file:r.file_id?{id:r.file_id,name:r.name,type:r.media_type,size:r.byte_length}:null}))});
  }
  check(user.id===pupil.id||area==='mensagens',403,'Envio exclusivo do aluno.');
  const requestKey=request.headers.get('Idempotency-Key');
  check(requestKey&&/^[0-9a-f-]{36}$/i.test(requestKey),400,'Identificador inválido.');
  const duplicate=await sql(db,'SELECT id FROM bt_entries WHERE author_id=? AND request_key=?',user.id,requestKey).first();
  if(duplicate)return json({id:duplicate.id});
  check(Number(request.headers.get('Content-Length')||0)<=maxFile+100000,413,'Arquivo acima de 10 MB.');
  const data=await request.formData();
  const raw=data.get('content');check(typeof raw==='string'&&raw.length<=64000,400,'Registro inválido.');
  let content;
  try{content=objectValue(JSON.parse(raw));}catch(error){if(error instanceof Failure)throw error;throw new Failure(400,'Registro inválido.');}
  delete content.file;delete content.email;delete content.arquivo;
  if(area==='mensagens') {
    check(typeof content.mensagem==='string'&&content.mensagem.trim()&&content.mensagem.length<=1500,400,'Escreva uma mensagem.');
    content.autor=user.name;
  }
  if(content.link)check(/^https:\/\//.test(content.link),400,'Use link HTTPS.');
  const file=data.get('file');
  if(file) {
    check(file instanceof File&&file.size>0&&file.size<=maxFile,413,'Escolha arquivo de até 10 MB.');
    const allowed=area==='mensagens'?['application/pdf','image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/ogg','audio/webm','audio/wav']:area==='exames'?['application/pdf','image/jpeg','image/png','image/webp']:['image/jpeg','image/png','image/webp'];
    check(allowed.includes(file.type),415,'Formato não permitido.');
    if(file.type==='application/pdf')check(new TextDecoder().decode(await file.slice(0,5).arrayBuffer())==='%PDF-',415,'PDF inválido.');
  }
  if(area==='exames'&&content.situacao!=='Não tenho exames recentes')check(file||content.link,400,'Anexe o exame ou informe link.');
  if(area.startsWith('fotos-'))check(file,400,'Anexe uma foto.');
  const id=crypto.randomUUID();
  const batch=[sql(db,'INSERT INTO bt_entries(id,user_id,area,author_id,content,request_key) VALUES (?,?,?,?,?,?)',id,pupil.id,area,user.id,JSON.stringify(content),requestKey)];
  if(file) {
    const fid=crypto.randomUUID();
    const name=file.name.replace(/[\u0000-\u001f\u007f\\/]/g,'_').slice(0,160)||'arquivo';
    batch.push(sql(db,'INSERT INTO bt_files(id,entry_id,name,media_type,byte_length) VALUES (?,?,?,?,?)',fid,id,name,file.type,file.size));
    const bytes=new Uint8Array(await file.arrayBuffer());
    for(let offset=0,part=0;offset<bytes.length;offset+=262144,part++)batch.push(sql(db,'INSERT INTO bt_file_chunks(file_id,part,bytes) VALUES (?,?,?)',fid,part,bytes.slice(offset,offset+262144).buffer));
  }
  batch.push(audit(db,user.id,'envio_'+area,pupil.id));
  try{await db.batch(batch);}catch(error){
    const row=await sql(db,'SELECT id FROM bt_entries WHERE author_id=? AND request_key=?',user.id,requestKey).first();
    if(row)return json({id:row.id});throw error;
  }
  return json({id},201);
}
async function download(db,user,id) {
  const file=await sql(db,'SELECT f.*,u.email FROM bt_files f JOIN bt_entries e ON e.id=f.entry_id JOIN bt_users u ON u.id=e.user_id WHERE f.id=?',id).first();
  check(file,404,'Arquivo não encontrado.');
  await target(db,user,file.email);
  const chunks=await all(db,'SELECT bytes FROM bt_file_chunks WHERE file_id=? ORDER BY part',id);
  const bytes=new Uint8Array(file.byte_length);let offset=0;
  for(const row of chunks){const chunk=new Uint8Array(row.bytes);bytes.set(chunk,offset);offset+=chunk.length;}
  check(offset===bytes.length,503,'Arquivo incompleto.');
  return new Response(bytes,{headers:{'Content-Type':file.media_type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'Content-Length':String(bytes.length),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
async function financeSave(request,db,user,body) {
  admin(user);
  const next=objectValue(body.content);
  check(['precos','descontos','acordos','auditoria'].every(k=>Array.isArray(next[k]))&&next.encargos,400,'Financeiro inválido.');
  check(next.precos.every(p=>typeof p.nome==='string'&&Number.isFinite(p.valor)&&p.valor>=0&&dayValue(p.inicio)),400,'Preço inválido.');
  check(next.descontos.every(p=>Number.isFinite(p.valor)&&p.valor>=0&&['percentual','fixo'].includes(p.unidade)&&(p.unidade!=='percentual'||p.valor<=100)&&dayValue(p.inicio)&&dayValue(p.fim)&&p.inicio<=p.fim),400,'Desconto inválido.');
  check(['multa','juros','carencia'].every(k=>Number.isFinite(next.encargos[k])&&next.encargos[k]>=0)&&next.encargos.multa<=100&&next.encargos.juros<=100&&Number.isSafeInteger(next.encargos.carencia),400,'Encargos inválidos.');
  const stored=await sql(db,'SELECT content,version FROM bt_finance WHERE singleton=1').first();
  const previous=JSON.parse(stored?.content||'{"acordos":[],"auditoria":[]}');
  check(body.version===(stored?.version||0),409,'O financeiro mudou. Recarregue antes de salvar.');
  const ids=new Set();
  let settlement=false;
  for(const agreement of next.acordos) {
    check(typeof agreement.id==='string'&&!ids.has(agreement.id),400,'Acordo duplicado.');
    ids.add(agreement.id);
    check(Number.isFinite(agreement.original)&&Number.isFinite(agreement.negociado)&&agreement.original>0&&agreement.negociado>=0&&agreement.negociado<=agreement.original,400,'Valores do acordo inválidos.');
    check(typeof agreement.meses==='string'&&agreement.meses.trim().length>0&&agreement.meses.length<=120,400,'Informe as competências.');
    check(['pendente','quitado'].includes(agreement.status),400,'Situação inválida.');
    const pupil=await target(db,user,agreement.aluno);check(pupil.role==='aluno',400,'Aluno inválido.');
    const old=previous.acordos.find(a=>a.id===agreement.id);
    if(old?.status==='quitado')check(JSON.stringify(agreement)===JSON.stringify(old),409,'Um acordo quitado deve manter seu histórico.');
    if(agreement.status==='quitado'&&old?.status!=='quitado') {
      check(old,400,'Salve o acordo antes de registrar o recebimento.');
      check(['aluno','meses','original','negociado'].every(k=>agreement[k]===old[k]),409,'Os valores do acordo mudaram.');
      settlement=true;
      agreement.quitadoEm=new Date().toISOString();agreement.confirmadoPor=user.email;
    }
  }
  check(previous.acordos.every(a=>ids.has(a.id)),400,'Os acordos existentes devem manter o histórico.');
  if(settlement) {
    await limit(request,db,'financeiro');
    check(body.received===true&&await passwordValid(body.password,user.password_hash),401,'Confirme o recebimento e a senha do AD1.');
  }
  next.auditoria=[...previous.auditoria,{data:new Date().toISOString(),responsavel:user.email,acao:settlement?'baixa_confirmada':'financeiro_atualizado'}];
  const result=body.version===0
    ? await sql(db,'INSERT INTO bt_finance(singleton,content,version) VALUES (1,?,1) ON CONFLICT(singleton) DO NOTHING',JSON.stringify(next)).run()
    : await sql(db,'UPDATE bt_finance SET content=?,version=version+1 WHERE singleton=1 AND version=?',JSON.stringify(next),body.version).run();
  check(result.meta.changes===1,409,'O financeiro mudou. Recarregue antes de salvar.');
  return json({version:body.version+1,content:next});
}

async function api(request,env) {
  check(env.BALBY_DB,503,'O banco Balby Team ainda não está vinculado.');
  const db=env.BALBY_DB,url=new URL(request.url),path=url.pathname.slice(PREFIX.length),method=request.method;
  check(['GET','POST','PUT'].includes(method),405,'Método indisponível.');
  if(method!=='GET')check(request.headers.get('Origin')===url.origin,403,'Origem inválida.');
  if(path==='/health'&&method==='GET'){await sql(db,'SELECT singleton FROM bt_setup LIMIT 1').first();return json({ok:true});}
  if(path==='/setup'&&method==='POST') {
    check(env.BALBY_SETUP_TOKEN&&equal(request.headers.get('Authorization')||'','Bearer '+env.BALBY_SETUP_TOKEN),403,'Chave inválida.');
    check(!await sql(db,'SELECT singleton FROM bt_setup WHERE singleton=1').first(),409,'AD1 já configurado.');
    const body=await bodyJson(request),email=emailValue(body.email),name=nameValue(body.name),id=crypto.randomUUID();
    const hash=await passwordHash(body.password);
    await db.batch([sql(db,"INSERT INTO bt_users(id,email,name,role,password_hash) VALUES (?,?,?,'admin',?)",id,email,name,hash),sql(db,'INSERT INTO bt_setup(singleton,user_id) VALUES (1,?)',id),audit(db,id,'ad1_configurado',id)]);
    return json({email},201);
  }
  if(path==='/login'&&method==='POST'){
    await limit(request,db,'login');
    const body=await bodyJson(request),email=emailValue(body.email);
    const user=await sql(db,'SELECT * FROM bt_users WHERE email=? AND enabled=1',email).first();
    const valid=await passwordValid(body.password,user?.password_hash||'pbkdf2-sha256$100000$dummy$'+'0'.repeat(64));
    check(user&&valid,401,'E-mail ou senha incorretos, ou acesso desativado.');
    return login(db,user,body.remember===true);
  }
  if(path==='/invites/accept'&&method==='POST')return inviteAccept(request,db,await bodyJson(request));
  const user=await session(request,db);check(user,401,'Entre na sua conta.');
  if(method!=='GET')check(equal(request.headers.get('X-CSRF-Token')||'',user.csrf),403,'Sessão inválida. Entre novamente.');
  if(path==='/me'&&method==='GET')return json(await bootstrap(db,user));
  if(path==='/logout'&&method==='POST'){
    await sql(db,'DELETE FROM bt_sessions WHERE token_hash=?',user.token_hash).run();
    return json({ok:true},200,{'Set-Cookie':COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});
  }
  if(path==='/reauth'&&method==='POST'){
    await limit(request,db,'reauth');check(await passwordValid((await bodyJson(request)).password,user.password_hash),401,'Senha incorreta.');return json({ok:true});
  }
  if(path==='/finance'&&method==='PUT')return financeSave(request,db,user,await bodyJson(request));
  if(path==='/documents'&&method==='PUT')return documentSave(db,user,await bodyJson(request));
  if(path==='/daily'&&method==='PUT')return documentSave(db,user,await bodyJson(request),true);
  if(path==='/users'&&['POST','PUT'].includes(method))return userSave(db,user,await bodyJson(request),method==='POST');
  if(path==='/invites'&&method==='POST')return inviteCreate(db,user,await bodyJson(request));
  if(path==='/entries'&&['GET','POST'].includes(method))return entryRoute(request,db,user,url);
  if(path.startsWith('/files/')&&method==='GET')return download(db,user,path.slice(7));
  throw new Failure(404,'Recurso não encontrado.');
}
export default {
  async fetch(request,env) {
    const path=new URL(request.url).pathname;
    if(path!==PREFIX&&!path.startsWith(PREFIX+'/'))return env.ASSETS.fetch(request);
    try{return await api(request,env);}catch(error){
      if(error instanceof Failure)return json({error:error.message},error.status);
      if(/bt_version_conflict/.test(error.message))return json({error:'O cadastro mudou. Recarregue antes de salvar.'},409);
      if(/UNIQUE constraint failed/.test(error.message))return json({error:'Registro já cadastrado. Recarregue e confira os dados.'},409);
      console.error('Balby D1',error.name);
      return json({error:'Não foi possível concluir. Tente novamente.'},503);
    }
  }
};
