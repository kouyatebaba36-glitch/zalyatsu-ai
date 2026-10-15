import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';

const app=express();
app.set('trust proxy', 1);
const username = process.env.APP_USERNAME;
const password = process.env.APP_PASSWORD;
if (!username || !password || password.length < 16) {
  throw new Error('Configurez APP_USERNAME et APP_PASSWORD (16 caractères minimum).');
}
function equal(a,b) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(),crypto.createHash('sha256').update(b).digest());
}
app.get('/healthz', (req,res)=>res.json({status:'ok'}));
app.use(rateLimit({windowMs:60_000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
app.use((req,res,next)=>{
  const auth=req.headers.authorization || '';
  const decoded=auth.startsWith('Basic ')?Buffer.from(auth.slice(6),'base64').toString('utf8'):'';
  const index=decoded.indexOf(':');
  if(index<0 || !equal(decoded.slice(0,index),username) || !equal(decoded.slice(index+1),password)) {
    res.set('WWW-Authenticate','Basic realm="ZALYATSU AI", charset="UTF-8"');
    res.set('Cache-Control','no-store');
    return res.status(401).send('Accès privé. Identifiants requis.');
  }
  res.set('Cache-Control','no-store');
  next();
});
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'30kb'}));
app.use('/api',rateLimit({windowMs:60_000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}));
const key=(process.env.HF_API_KEY||process.env.HF_CREDENTIALS||'').trim();
const models={
 'wan/v2.7/text-to-video':{label:'Wan 2.7 · Texte vers vidéo',kind:'video',duration:[2,15]},
 'bytedance/seedance-2.0/text-to-video':{label:'Seedance 2.0 · Texte vers vidéo',kind:'video',duration:[5,5]}
};
const jobs=new Map();
const sessions=new Map();
const cleanup=setInterval(()=>{
 const cutoff=Date.now()-24*60*60*1000;
 for(const [id,time] of sessions) if(time<cutoff)sessions.delete(id);
 for(const [id,job] of jobs) if(job.created<cutoff)jobs.delete(id);
},60_000);
cleanup.unref();
function session(req,res,next){let id=req.headers['x-zalyatsu-session'];if(typeof id!=='string'||!sessions.has(id)){return res.status(401).json({error:'Session manquante. Rechargez la page.'});}req.sid=id;next()}
app.get('/api/session',(req,res)=>{const id=crypto.randomUUID();sessions.set(id,Date.now());res.set('Cache-Control','no-store').json({session:id,configured:!!key,models});});
async function upstream(path,method='GET',body){if(!key)throw Object.assign(new Error('Configurez HF_API_KEY sur le serveur.'),{status:503});const r=await fetch('https://api.higgsfield.ai/'+path,{method,signal:AbortSignal.timeout(30_000),redirect:'error',headers:{Authorization:`Key ${key}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={error:'Réponse inattendue du fournisseur.'}}if(!r.ok)throw Object.assign(new Error(`Erreur Higgsfield (${r.status}). Vérifiez la clé, les crédits et le modèle.`),{status:r.status});return data}
app.post('/api/generate',session,async(req,res)=>{try{const {model,prompt,aspect_ratio,duration}=req.body;const def=models[model];if(!def) return res.status(400).json({error:'Modèle non autorisé.'});if(typeof prompt!=='string'||!prompt.trim()||prompt.length>3000)return res.status(400).json({error:'Prompt invalide (1–3000 caractères).'});if(!['16:9','9:16','1:1'].includes(aspect_ratio))return res.status(400).json({error:'Format invalide.'});let payload={prompt:prompt.trim(),aspect_ratio};if(model==='wan/v2.7/text-to-video'){const d=Number(duration);if(!Number.isInteger(d)||d<2||d>15)return res.status(400).json({error:'Durée invalide.'});payload={...payload,duration:d,resolution:'720p'}}else{payload={...payload,duration:5,resolution:'720p',generate_audio:true}}const data=await upstream(model,'POST',payload);if(!data.request_id)throw new Error('Identifiant de génération absent.');jobs.set(data.request_id,{sid:req.sid,model,created:Date.now()});res.json({request_id:data.request_id})}catch(e){res.status(e.status&&e.status<600?e.status:502).json({error:'Échec de la requête Higgsfield. Vérifiez la configuration et réessayez après contrôle du tableau de bord fournisseur.'})}});
app.get('/api/jobs/:id',session,async(req,res)=>{const job=jobs.get(req.params.id);if(!job||job.sid!==req.sid)return res.status(404).json({error:'Génération introuvable dans cette session.'});try{res.json(await upstream(`requests/${encodeURIComponent(req.params.id)}/status`))}catch(e){res.status(e.status||502).json({error:'Échec de la requête Higgsfield. Vérifiez la configuration et réessayez après contrôle du tableau de bord fournisseur.'})}});
app.post('/api/jobs/:id/cancel',session,async(req,res)=>{const job=jobs.get(req.params.id);if(!job||job.sid!==req.sid)return res.status(404).json({error:'Génération introuvable.'});try{res.json(await upstream(`requests/${encodeURIComponent(req.params.id)}/cancel`,'POST'))}catch(e){res.status(e.status||502).json({error:'Échec de la requête Higgsfield. Vérifiez la configuration et réessayez après contrôle du tableau de bord fournisseur.'})}});
app.use(express.static(new URL('./public/',import.meta.url).pathname));
app.use((err,req,res,next)=>res.status(400).json({error:'Requête invalide.'}));
app.listen(process.env.PORT||3000,()=>console.log('ZALYATSU AI prêt sur le port '+(process.env.PORT||3000)));
