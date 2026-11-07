import fs from 'node:fs';
import path from 'node:path';
const assets={};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.txt':'text/plain'};
function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else if(f.name!=='CNAME'&&!f.name.startsWith('_'))assets['/'+path.relative('dist',p).split(path.sep).join('/')]=[fs.readFileSync(p,'utf8'),types[path.extname(p)]||'text/plain'];}}
walk('dist');fs.mkdirSync('.build',{recursive:true});
fs.writeFileSync('.build/pages-connector.js',`const assets=${JSON.stringify(assets)};export default {fetch(request){if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const p=new URL(request.url).pathname;const a=assets[p==='/'?'/index.html':p];if(!a)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:a[0],{headers:{'Content-Type':a[1],'Cache-Control':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}})}};`);
