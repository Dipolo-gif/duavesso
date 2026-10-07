// Chave pública (publishable): feita para o navegador; o acesso é limitado pelo RLS no banco.
export const SUPABASE_URL='https://bkyzkighkuswsssvicpy.supabase.co';
export const SUPABASE_KEY='sb_publishable_9rzjsC4wmHSmBxlKZfIwJg_SlDprprm';
const SESSION_KEY='duavesso.session.v1',PKCE_KEY='duavesso.pkce.v1';
// One-time, same-origin migration: keep carts and sessions after the rebrand.
// Remove legacy tokens only after the new value is safely stored, so logout
// cannot resurrect an old session on the next page load.
for(const suffix of ['session.v1','pkce.v1','cart.v1','orders.v1']){
 try{
  const legacy='doavesso.'+suffix,next='duavesso.'+suffix,value=localStorage.getItem(legacy);
  if(value!==null){if(localStorage.getItem(next)===null)localStorage.setItem(next,value);localStorage.removeItem(legacy);}
 }catch{}
}
const USER_ERRORS=new Set(['22023','53400']);
export const online=()=>typeof fetch==='function'&&SUPABASE_URL.startsWith('https://');
// Falha de rede (servidor fora do ar, sem internet): mensagem clara em vez de 'Failed to fetch'
const OFFLINE='Não foi possível conectar com a loja agora. Verifique sua internet e tente de novo em instantes.';
async function net(url,options){try{return await fetch(url,options);}catch{throw new Error(OFFLINE);}}
const siteURL=()=>location.origin+location.pathname;

// Sessão ------------------------------------------------------------------------
let session=null;
try{session=JSON.parse(localStorage.getItem(SESSION_KEY));if(!session?.access_token||!session?.refresh_token)session=null;}catch{session=null;}
export const getSession=()=>session;
export const getUser=()=>session?.user||null;
function setSession(next){
 session=next&&next.access_token?{access_token:next.access_token,refresh_token:next.refresh_token,expires_at:next.expires_at||Math.floor(Date.now()/1000)+(next.expires_in||3600),user:userView(next.user)}:null;
 try{if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);}catch{}
 window.dispatchEvent(new CustomEvent('duavesso:auth',{detail:session?.user||null}));
}
function userView(u){if(!u)return null;const m=u.user_metadata||{};return {id:u.id,email:u.email,name:m.name||m.full_name||'',provider:u.app_metadata?.provider||'email'};}
async function refreshIfNeeded(){
 if(!session)return;
 if(session.expires_at-Math.floor(Date.now()/1000)>60)return;
 try{const data=await authFetch('token?grant_type=refresh_token',{refresh_token:session.refresh_token});setSession(data);}
 catch{setSession(null);}
}
export async function authHeaders(){
 await refreshIfNeeded();
 return {apikey:SUPABASE_KEY,Authorization:`Bearer ${session?session.access_token:SUPABASE_KEY}`};
}

// Erros ---------------------------------------------------------------------------
const AUTH_MESSAGES=[
 [/invalid login credentials|invalid_credentials/i,'E-mail ou senha incorretos.'],
 [/email not confirmed|email_not_confirmed/i,'Confirme seu e-mail antes de entrar. Procure a mensagem da duavesso na caixa de entrada.'],
 [/already registered|user_already_exists|already been registered/i,'Já existe uma conta com este e-mail. Tente entrar.'],
 [/password should|weak_password|at least/i,'A senha precisa ter pelo menos 8 caracteres, com letras e números.'],
 [/rate limit|too many|over_/i,'Muitas tentativas em pouco tempo. Aguarde alguns minutos.'],
 [/invalid email|email_address_invalid|validate email/i,'Digite um e-mail válido.'],
 [/same_password/i,'A nova senha precisa ser diferente da atual.'],
 [/signups not allowed|signup_disabled/i,'Cadastros estão desativados no momento.'],
];
function friendlyAuthError(body){
 const raw=[body?.error_code,body?.code,body?.msg,body?.message,body?.error_description,body?.error].filter(Boolean).join(' ');
 for(const [re,msg] of AUTH_MESSAGES)if(re.test(raw))return msg;
 return 'Não foi possível concluir agora. Tente de novo em instantes.';
}
async function handle(response){
 if(response.ok)return response.status===204?null:response.json();
 let message='Não foi possível falar com a loja agora. Tente de novo em instantes.';
 try{const error=await response.json();if(error.code==='23505')message='Este CPF já está cadastrado em outra conta. Cada CPF pode ter só uma conta.';else if(USER_ERRORS.has(error.code)&&typeof error.message==='string')message=error.message;else if(error.msg||error.error_code||error.error_description||error.error)message=friendlyAuthError(error);}catch{}
 throw new Error(message);
}
async function authFetch(path,body,method='POST',extra={}){
 const response=await net(`${SUPABASE_URL}/auth/v1/${path}`,{method,headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 return handle(response);
}

// Conta ---------------------------------------------------------------------------
export async function signUp(email,password,name){
 const data=await authFetch('signup',{email,password,data:{name}});
 if(data?.access_token){setSession(data);return {confirmed:true};}
 return {confirmed:false};
}
export async function signIn(email,password){
 const data=await authFetch('token?grant_type=password',{email,password});
 setSession(data);return session.user;
}
export async function signOut(){
 const token=session?.access_token;
 setSession(null);
 if(token)try{await net(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});}catch{}
}
export async function resetPassword(email){
 await authFetch('recover',{email},'POST',{});
}
export async function updatePassword(password){
 const headers=await authHeaders();
 const user=await handle(await net(`${SUPABASE_URL}/auth/v1/user`,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({password})}));
 if(session)setSession({...session,user,expires_in:session.expires_at-Math.floor(Date.now()/1000)});
}
function randomString(length){const bytes=crypto.getRandomValues(new Uint8Array(length));return Array.from(bytes,b=>'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'[b%66]).join('');}
const base64url=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function signInWithGoogle(){
 const settings=await handle(await net(`${SUPABASE_URL}/auth/v1/settings`,{headers:{apikey:SUPABASE_KEY}}));
 if(!settings?.external?.google)throw new Error('Login com Google ainda não está ativado. Use e-mail e senha por enquanto.');
 const verifier=randomString(64);
 const challenge=base64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 localStorage.setItem(PKCE_KEY,verifier);
 const params=new URLSearchParams({provider:'google',redirect_to:siteURL(),code_challenge:challenge,code_challenge_method:'s256'});
 location.assign(`${SUPABASE_URL}/auth/v1/authorize?${params}`);
}
// Trata o retorno do Google (?code=), da confirmação de e-mail e da redefinição de senha (#access_token=…).
export async function handleAuthRedirect(){
 const url=new URL(location.href),hash=new URLSearchParams(url.hash.replace(/^#/,''));
 let outcome=null;
 const code=url.searchParams.get('code');
 if(code){
  const verifier=localStorage.getItem(PKCE_KEY);localStorage.removeItem(PKCE_KEY);
  url.searchParams.delete('code');
  try{if(!verifier)throw new Error('Abra o link no mesmo navegador em que começou o login.');const data=await authFetch('token?grant_type=pkce',{auth_code:code,code_verifier:verifier});setSession(data);outcome={type:'signed_in'};}
  catch(error){outcome={type:'error',message:error.message};}
 }else if(hash.get('access_token')){
  setSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in'))||3600,user:null});
  try{const user=await handle(await net(`${SUPABASE_URL}/auth/v1/user`,{headers:await authHeaders()}));setSession({...session,user,expires_in:session.expires_at-Math.floor(Date.now()/1000)});}catch{}
  outcome={type:hash.get('type')==='recovery'?'recovery':'signed_in'};
  url.hash='';
 }else if(hash.get('error_description')||url.searchParams.get('error_description')){
  outcome={type:'error',message:hash.get('error_description')||url.searchParams.get('error_description')};
  url.hash='';url.searchParams.delete('error');url.searchParams.delete('error_code');url.searchParams.delete('error_description');
 }
 if(outcome)history.replaceState(null,'',url.pathname+url.search+url.hash);
 return outcome;
}
export const authRedirectURL=siteURL;

// Dados ---------------------------------------------------------------------------
export async function fetchProducts(){
 const fields='id,name,category,color,base,price_cents,tag,graphic,graphic_class,description,print,fabric,finish,fit,care';
 const rows=await handle(await net(`${SUPABASE_URL}/rest/v1/products?select=${fields}&active=eq.true&order=sort_order`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}}));
 return rows.map(p=>({id:p.id,name:p.name,category:p.category,color:p.color,base:p.base,price:p.price_cents,tag:p.tag,graphic:p.graphic,graphicClass:p.graphic_class,description:p.description,print:p.print,fabric:p.fabric,finish:p.finish,fit:p.fit,care:p.care}));
}
export async function rpc(name,args){
 return handle(await net(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{...await authHeaders(),'Content-Type':'application/json'},body:JSON.stringify(args)}));
}
export async function uploadDesign(path,blob){
 await handle(await net(`${SUPABASE_URL}/storage/v1/object/designs/${path}`,{method:'POST',headers:{...await authHeaders(),'Content-Type':blob.type},body:blob}));
 return path;
}
export async function fetchProfile(){
 if(!session)return null;
 const rows=await handle(await net(`${SUPABASE_URL}/rest/v1/profiles?select=name,cep,city,address,phone,cpf,country,state,avatar&id=eq.${session.user.id}`,{headers:await authHeaders()}));
 return rows[0]||{name:'',cep:'',city:'',address:'',phone:'',cpf:'',country:'BR',state:'',avatar:''};
}
export async function updateProfile(profile){
 const headers=await authHeaders();
 await handle(await net(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(profile)}));
}
export async function fetchMyOrders(){
 return handle(await net(`${SUPABASE_URL}/rest/v1/orders?select=code,status,created_at,total_cents,payment,shipping,order_items(name,base,size,qty,unit_price_cents)&order=created_at.desc&limit=20`,{headers:await authHeaders()}));
}
export function dataURLToBlob(dataURL){
 const [meta,base64]=dataURL.split(','),type=meta.slice(5,meta.indexOf(';')),binary=atob(base64),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Blob([bytes],{type});
}
