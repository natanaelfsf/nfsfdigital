(() => {
const form=document.querySelector('#review'), version=form.elements.version, note=form.elements.note;
const preview=document.querySelector('#preview'), history=document.querySelector('#review-history'), status=document.querySelector('#review-status');
const key='nfsf-demo-reviews';
let reviews=[];
try { const saved=JSON.parse(localStorage.getItem(key)); if(Array.isArray(saved)) reviews=saved; } catch {}
const projectKey = 'nfsf-demo-project';
 const stageForm = document.querySelector('#admin-etapa');
 const previewForm = document.querySelector('#admin-previa');
 const replyForm = document.querySelector('#admin-resposta');
 const stage = stageForm.elements.stage;
 const requests = replyForm.elements.request;
 const adminStatus = document.querySelector('#admin-status');
 const timeline = Array.from(document.querySelectorAll('#acompanhar ol li'));
 let project = {stage:3, versions:[]};
 try {
   const saved = JSON.parse(localStorage.getItem(projectKey));
   if (saved && Array.isArray(saved.versions) && timeline[saved.stage]) project = saved;
 } catch {}
 function save(key, value, message) {
   try { localStorage.setItem(key, JSON.stringify(value)); adminStatus.textContent = message; }
   catch { adminStatus.textContent = message + ' Alteração disponível nesta sessão.'; }
 }
 function renderAdmin() {
   stage.selectedIndex = project.stage;
   timeline.forEach((item, index) => {
     item.toggleAttribute('data-current', index === project.stage);
     if (index === project.stage) item.setAttribute('aria-current', 'step');
     else item.removeAttribute('aria-current');
   });
   requests.replaceChildren(new Option('Selecione um pedido', ''));
   reviews.forEach((review, index) => {
     if (review?.text?.startsWith('Ajuste solicitado')) {
       requests.add(new Option('V' + review.version + ' · ' + review.text, String(index)));
     }
   });
   replyForm.querySelector('button').disabled = requests.options.length === 1;
 }
 for (const item of project.versions) version.add(new Option('Versão ' + item.id + ' · Prévia', item.id));
 stageForm.addEventListener('submit', event => {
   event.preventDefault();
   project.stage = stage.selectedIndex;
   save(projectKey, project, 'Etapa atualizada.');
   renderAdmin();
 });
 previewForm.addEventListener('submit', event => {
   event.preventDefault();
   const description = previewForm.elements.description.value.trim();
   if (!description) return;
   const id = String(project.versions.length + 3);
   project.versions.push({id, description});
   version.add(new Option('Versão ' + id + ' · Prévia', id), 0);
   version.value = id;
   note.value = '';
   status.textContent = '';
   previewForm.reset();
   save(projectKey, project, 'Versão ' + id + ' publicada na demonstração.');
   render();
 });
 replyForm.addEventListener('submit', event => {
   event.preventDefault();
   const review = requests.value === '' ? null : reviews[Number(requests.value)];
   const reply = replyForm.elements.reply.value.trim();
   if (!review || !reply) return;
   review.replies = [...(review.replies || []), reply];
   replyForm.reset();
   save(key, reviews, 'Resposta registrada na versão ' + review.version + '.');
   render();
 });
 function render(){
 renderAdmin();
 preview.textContent=project.versions.find(item=>item.id===version.value)?.description ?? (version.value==='2'?'Catálogo com preços e resumo do pedido.':'Catálogo com categorias e preços.');
 history.replaceChildren();
 const entries=reviews.filter(item=>item?.version===version.value);
 for(const text of entries.length?entries.flatMap(item=>[item.text,...(item.replies||[]).map(reply=>'Resposta NFSF · '+reply)]):['Nenhuma decisão registrada.']){
  const li=document.createElement('li');
  li.textContent=text;
  history.append(li);
 }
}
version.addEventListener('change',()=>{note.value=''; status.textContent=''; render();});
form.addEventListener('submit',event=>{
 event.preventDefault();
 const action=event.submitter?.value, text=note.value.trim();
 if(!action)return;
 if(action==='Ajuste solicitado'&&!text){status.textContent='Descreva a mudança desejada.';note.focus();return;}
 reviews.unshift({version:version.value,text:[action,text].filter(Boolean).join(' · ')});
 try {localStorage.setItem(key,JSON.stringify(reviews));status.textContent='Decisão salva neste navegador.';} catch {status.textContent='Decisão registrada nesta sessão.';}
 note.value='';render();
});
render();
})();