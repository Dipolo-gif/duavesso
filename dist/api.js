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
// Prazo máximo de uma sessão: depois de 30 dias do login, pede para entrar de novo.
const MAX_SESSION_SECONDS=30*24*3600;
const now=()=>Math.floor(Date.now()/1000);
function readStoredSession(){
 try{const s=JSON.parse(localStorage.getItem(SESSION_KEY));if(!s?.access_token||!s?.refresh_token)return null;return {...s,started_at:s.started_at||now()};}catch{return null;}
}
let session=readStoredSession();
if(session&&now()-session.started_at>MAX_SESSION_SECONDS){session=null;try{localStorage.removeItem(SESSION_KEY);}catch{}}
export const getSession=()=>session;
export const getUser=()=>session?.user||null;
// fresh=true num login novo (começa a contar os 30 dias); renovações mantêm o início da sessão.
// O evento duavesso:auth só dispara quando a pessoa logada muda, não a cada renovação de token.
function setSession(next,fresh=false){
 const before=JSON.stringify(session?.user||null);
 session=next&&next.access_token?{access_token:next.access_token,refresh_token:next.refresh_token,expires_at:next.expires_at||now()+(next.expires_in||3600),started_at:fresh||!session?.started_at?now():session.started_at,user:next.user===undefined?session?.user||null:userView(next.user)}:null;
 try{if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);}catch{}
 if(JSON.stringify(session?.user||null)!==before)window.dispatchEvent(new CustomEvent('duavesso:auth',{detail:session?.user||null}));
}
function userView(u){if(!u)return null;if(!u.user_metadata&&'name' in u)return u;const m=u.user_metadata||{};return {id:u.id,email:u.email,name:m.name||m.full_name||'',provider:u.app_metadata?.provider||'email'};}
// Outra aba entrou, saiu ou renovou o token: esta aba passa a usar a mesma sessão.
window.addEventListener('storage',e=>{
 if(e.key!==SESSION_KEY)return;
 const before=JSON.stringify(session?.user||null);
 session=readStoredSession();
 if(JSON.stringify(session?.user||null)!==before)window.dispatchEvent(new CustomEvent('duavesso:auth',{detail:session?.user||null}));
});
// O token de renovação só vale uma vez. Uma renovação por vez nesta aba (promessa compartilhada)
// e entre abas (Web Locks, quando o navegador tem); dentro da trava, se outra aba já renovou, usa a dela.
let refreshing=null;
async function refreshNow(){
 if(!session)return;
 const stored=readStoredSession();
 if(stored&&stored.refresh_token!==session?.refresh_token&&stored.expires_at-now()>60){session=stored;return;}
 try{const data=await authFetch('token?grant_type=refresh_token',{refresh_token:session.refresh_token});setSession(data);}
 catch(error){if(error.message!==OFFLINE)setSession(null);} // sem internet não desloga; token inválido desloga
}
function refreshIfNeeded(){
 if(!session)return;
 if(now()-session.started_at>MAX_SESSION_SECONDS){signOut();return;}
 if(session.expires_at-now()>60)return;
 refreshing??=(navigator.locks?.request?navigator.locks.request('duavesso-auth-refresh',refreshNow):refreshNow()).finally(()=>{refreshing=null;});
 return refreshing;
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
// Erro inesperado: o cliente vê um código curto para passar ao suporte (código do erro + hora em base 36),
// que permite achar a falha nos logs do Supabase em vez de só "tente de novo".
const GENERIC_ERROR='Não foi possível falar com a loja agora. Tente de novo em instantes.';
const supportCode=code=>`${String(code).replace(/[^\w]/g,'').slice(0,10).toUpperCase()}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
async function handle(response){
 if(response.ok)return response.status===204?null:response.json();
 let message=GENERIC_ERROR,code=response.status;
 try{const error=await response.json();code=error.code||error.error_code||code;if(error.code==='23505')message='Este CPF já está cadastrado em outra conta. Cada CPF pode ter só uma conta.';else if(USER_ERRORS.has(error.code)&&typeof error.message==='string')message=error.message;else if(error.msg||error.error_code||error.error_description||error.error)message=friendlyAuthError(error);}catch{}
 if(message===GENERIC_ERROR)message+=` Se continuar, informe ao suporte o código ${supportCode(code)}.`;
 throw new Error(message);
}
async function authFetch(path,body,method='POST',extra={}){
 const response=await net(`${SUPABASE_URL}/auth/v1/${path}`,{method,headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 return handle(response);
}

// Conta ---------------------------------------------------------------------------
export async function signUp(email,password,name){
 const data=await authFetch('signup',{email,password,data:{name}});
 if(data?.access_token){setSession(data,true);return {confirmed:true};}
 return {confirmed:false};
}
export async function signIn(email,password){
 const data=await authFetch('token?grant_type=password',{email,password});
 setSession(data,true);return session.user;
}
// Sai na hora (nesta e nas outras abas) e revoga a sessão no servidor. Se o acesso já venceu, renova
// antes, senão o logout falharia em silêncio e a sessão continuaria válida lá. Sem internet, tenta 2 vezes.
export async function signOut(){
 const old=session;
 setSession(null);
 if(!old)return;
 let {access_token:token,refresh_token:refresh,expires_at:expires}=old;
 for(let attempt=0;attempt<2;attempt++){
  try{
   if(expires-now()<=30){const data=await authFetch('token?grant_type=refresh_token',{refresh_token:refresh});({access_token:token,refresh_token:refresh}=data);expires=now()+(data.expires_in||3600);}
   const response=await net(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
   if(response.ok||response.status===401||response.status===403)return; // 401/403: a sessão já não existe no servidor
  }catch(error){if(error.message!==OFFLINE)return;} // token de renovação inválido: nada a revogar
 }
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
  try{if(!verifier)throw new Error('Abra o link no mesmo navegador em que começou o login.');const data=await authFetch('token?grant_type=pkce',{auth_code:code,code_verifier:verifier});setSession(data,true);outcome={type:'signed_in'};}
  catch(error){outcome={type:'error',message:error.message};}
 }else if(hash.get('access_token')){
  setSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in'))||3600,user:null},true);
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
// Promoções em vigor (migração 0008). null quando o banco ainda não tem a tabela ou está fora do ar:
// o site segue com as promoções padrão de commerce.js.
export async function fetchPromos(){
 try{
  const res=await fetch(`${SUPABASE_URL}/rest/v1/promotions?select=kind,min_subtotal_cents,label`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}});
  if(!res.ok)return null;
  return (await res.json()).map(p=>({kind:p.kind,min:p.min_subtotal_cents,label:p.label}));
 }catch{return null;}
}
// Prévia do cupom no checkout; o desconto de verdade é recalculado pelo place_order.
export async function checkCoupon(code,subtotal){
 const res=await net(`${SUPABASE_URL}/rest/v1/rpc/check_coupon`,{method:'POST',headers:{...await authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({p_code:code,p_subtotal_cents:subtotal})});
 if(res.status===404)return {ok:false,message:'Cupons ainda não estão disponíveis.'};
 return handle(res);
}
// Marcas parceiras (migração 0009) ---------------------------------------------------------
const BRAND_FIELDS='slug,name,tagline,bio,status,plan,theme,logo_path,cover_path,links,featured_product_id,featured_badge,featured_until,external_url,updated_at';
// Lista pública (só marcas ativas); null se o banco ainda não tem a tabela ou está fora do ar
export async function fetchBrands(){
 try{const res=await fetch(`${SUPABASE_URL}/rest/v1/brands?select=${BRAND_FIELDS}&status=eq.active&order=name`,{headers:await authHeaders()});return res.ok?await res.json():null;}catch{return null;}
}
// Uma marca; o dono vê a própria mesmo suspensa. undefined = não deu para consultar; null = não existe
export async function fetchBrand(slug){
 try{const res=await fetch(`${SUPABASE_URL}/rest/v1/brands?select=${BRAND_FIELDS}&slug=eq.${encodeURIComponent(slug)}`,{headers:await authHeaders()});if(!res.ok)return undefined;return (await res.json())[0]||null;}catch{return undefined;}
}
// Marcas que a pessoa logada edita (vazio antes da 0009 ou sem login)
export async function myBrands(){
 if(!session)return [];
 try{const res=await net(`${SUPABASE_URL}/rest/v1/rpc/my_brands`,{method:'POST',headers:{...await authHeaders(),'Content-Type':'application/json'},body:'{}'});return res.ok?await res.json():[];}catch{return [];}
}
export async function updateBrand(slug,patch){
 const rows=await handle(await net(`${SUPABASE_URL}/rest/v1/brands?slug=eq.${encodeURIComponent(slug)}`,{method:'PATCH',headers:{...await authHeaders(),'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(patch)}));
 if(!rows?.length)throw new Error('Você não tem permissão para editar esta marca.');
 return rows[0];
}
// Logo ou faixa de capa, já convertida para WebP no navegador; devolve o caminho a gravar na marca
export async function uploadBrandAsset(slug,kind,blob){
 const path=`${slug}/${kind}-${crypto.randomUUID().slice(0,13)}.webp`;
 await handle(await net(`${SUPABASE_URL}/storage/v1/object/brand-assets/${path}`,{method:'POST',headers:{...await authHeaders(),'Content-Type':'image/webp'},body:blob}));
 return path;
}
export const brandAssetURL=path=>!path?'':path.startsWith('assets/')?path:`${SUPABASE_URL}/storage/v1/object/public/brand-assets/${path}`;
export async function isAdmin(){
 if(!session)return false;
 try{const res=await net(`${SUPABASE_URL}/rest/v1/rpc/is_admin`,{method:'POST',headers:{...await authHeaders(),'Content-Type':'application/json'},body:'{}'});return res.ok?(await res.json())===true:false;}catch{return false;}
}
export const adminListBrands=()=>rpc('admin_list_brands',{});
export const adminCreateBrand=(email,slug,name)=>rpc('admin_create_brand',{p_email:email,p_slug:slug,p_name:name});
export const adminSetBrandStatus=(slug,status)=>rpc('admin_set_brand_status',{p_slug:slug,p_status:status});
export const adminSetBrandPlan=(slug,plan,note)=>rpc('admin_set_brand_plan',{p_slug:slug,p_plan:plan,p_note:note||null});
export const adminRemoveOwner=(slug,email)=>rpc('admin_remove_owner',{p_slug:slug,p_email:email});
// Pedidos de quem quer ter marca na duavesso (migração 0010): qualquer pessoa envia; só a duavesso lê
export const applyBrand=({name,email,brand,instagram,about})=>rpc('apply_brand',{p_name:name,p_email:email,p_brand:brand,p_instagram:instagram||null,p_about:about});
export const adminListApplications=()=>rpc('admin_list_applications',{});
export const adminSetApplicationStatus=(id,status)=>rpc('admin_set_application_status',{p_id:id,p_status:status});
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
// O CPF só muda por set_profile_cpf (migração 0007: confere os dígitos e limita as tentativas por dia,
// para ninguém usar a loja para descobrir de quem é um CPF). O resto do perfil vai por PATCH.
export async function updateProfile(profile,previousCPF=null){
 const {cpf=null,...rest}=profile;
 const patch=async body=>handle(await net(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`,{method:'PATCH',headers:{...await authHeaders(),'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(body)}));
 await patch(rest);
 if((cpf||null)===(previousCPF||null))return;
 const response=await net(`${SUPABASE_URL}/rest/v1/rpc/set_profile_cpf`,{method:'POST',headers:{...await authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({p_cpf:cpf})});
 if(response.status===404){await patch({cpf});return;} // banco ainda sem a 0007: grava como antes
 const result=await handle(response);
 if(result?.ok===false)throw new Error(result.message);
}
export async function fetchMyOrders(){
 return handle(await net(`${SUPABASE_URL}/rest/v1/orders?select=code,status,created_at,total_cents,payment,shipping,order_items(name,base,size,qty,unit_price_cents)&order=created_at.desc&limit=20`,{headers:await authHeaders()}));
}
export function dataURLToBlob(dataURL){
 const [meta,base64]=dataURL.split(','),type=meta.slice(5,meta.indexOf(';')),binary=atob(base64),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Blob([bytes],{type});
}
