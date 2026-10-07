import {readFile,access,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const html=await readFile('dist/index.html','utf8');
const app=await readFile('dist/app.js','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Duplicate element IDs');
const refs=[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1]).filter(x=>!x.startsWith('http'));
for(const m of [...html.matchAll(/(?:srcset|imagesrcset)="([^"]+)"/g),...app.matchAll(/assets\/tee-\$\{base\}-(\d+)\.(webp|jpg)/g)]){
 if(m[2])for(const base of ['white','black','brown'])refs.push(`assets/tee-${base}-${m[1]}.${m[2]}`);
 else refs.push(...m[1].split(',').map(s=>s.trim().split(/\s+/)[0]));
}
refs.push(...[...app.matchAll(/'(assets\/[^']+\.(?:webp|jpg|png))'/g)].map(m=>m[1]));
for(const ref of new Set(refs))await access(`dist/${ref}`);
for(const f of ['dist/vendor/motion.js','dist/vendor/three.js','dist/assets/tee.glb','dist/assets/tee-ao.webp','dist/assets/tee-LICENSE.txt'])await access(f);
for(const file of ['dist/app.js','dist/commerce.js','dist/motion-ui.js','dist/studio-3d.js','dist/studio-placement.js','server.mjs'])execFileSync(process.execPath,['--check',file]);
for(const id of ['inicio','colecao','sobre','studio-view','design-form','design-canvas','product-dialog','cart-dialog','checkout-dialog'])assert(ids.includes(id),`Missing route/control: ${id}`);
assert(app.includes('e.preventDefault()'),'Checkout must not submit personal data to a server');
const css=await readFile('dist/styles.css','utf8');
assert(css.includes('prefers-reduced-motion'),'Reduced-motion support required');
const SITE='https://loja-duavesso.vercel.app/';
for(const f of ['dist/robots.txt','dist/sitemap.xml','dist/llms.txt'])await access(f);
assert((await readFile('dist/robots.txt','utf8')).includes(SITE+'sitemap.xml'),'robots.txt must point to the sitemap');
const sitemap=await readFile('dist/sitemap.xml','utf8');
for(const m of sitemap.matchAll(/<(?:loc|image:loc)>([^<]+)</g)){assert(m[1].startsWith(SITE),`Sitemap URL outside site: ${m[1]}`);const rel=m[1].slice(SITE.length);if(rel)await access(`dist/${rel}`);}
const ld=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);assert(ld,'JSON-LD block missing');
const graph=JSON.parse(ld[1])['@graph'];assert(graph.some(n=>n['@type']==='OnlineStore')&&graph.some(n=>n['@type']==='ItemList'),'JSON-LD must describe the store and the catalog');
for(const url of JSON.stringify(graph).match(/https:\/\/[^"]+/g)){if(!url.startsWith(SITE))continue;const rel=url.slice(SITE.length).split('#')[0];if(rel)await access(`dist/${rel}`);}
for(const tag of ['rel="canonical"','property="og:image"','name="twitter:card"'])assert(html.includes(tag),`Missing ${tag}`);
for(const m of html.matchAll(/(?:href|content)="(https:\/\/loja-duavesso\.vercel\.app\/[^"#]+)"/g))await access(`dist/${m[1].slice(SITE.length)}`);
const secretPatterns=[/sk_(?:live|test)_[A-Za-z0-9]{8,}/,/service_role/i,/eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}/,/sb_secret_/,/BEGIN (?:RSA |EC )?PRIVATE KEY/];
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())out.push(...await walk(p));else if(/\.(html|js|css|txt|xml|json|svg)$/.test(e.name))out.push(p);}return out;}
for(const file of await walk('dist')){const text=await readFile(file,'utf8');for(const re of secretPatterns)assert(!re.test(text),`Possible secret in ${file}: ${re}`);}
// Sem o frame-guard.js, a proteção contra clickjacking e o resto da segurança dependem destes cabeçalhos da Vercel.
const vercel=JSON.parse(await readFile('vercel.json','utf8')),vh=Object.fromEntries(vercel.headers.find(h=>h.source==='/(.*)').headers.map(h=>[h.key.toLowerCase(),h.value]));
assert.match(vh['content-security-policy'],/frame-ancestors 'none'/);assert.match(vh['content-security-policy'],/script-src 'self';/);assert.equal(vh['x-frame-options'],'DENY');assert.match(vh['strict-transport-security'],/max-age=31536000/);assert.equal(vh['x-content-type-options'],'nosniff');
const manifest=JSON.parse(await readFile('.openai/hosting.json','utf8'));
assert.equal(manifest.static.directory,'dist');assert(manifest.project_id);
console.log(`Validated static entrypoint, ${new Set(refs).size} local references, ${ids.length} unique IDs, script syntax, route controls, SEO files, JSON-LD, no secrets in dist/, Vercel security headers and hosting manifest.`);
