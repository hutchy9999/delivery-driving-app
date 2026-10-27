import {mkdir,copyFile,cp,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'build','android-web');
await mkdir(out,{recursive:true});
// Explicit allowlist: personal backups, keys, test fixtures and docs never ship.
for(const name of ['index.html','app.js','calc.js','diagnostics.js','style.css','manifest.webmanifest','offer-ocr.js','traffic.js','traffic-model.js','traffic-settings.js','areas.js','areas-ui.js','privacy.html','terms.html'])await copyFile(path.join(root,name),path.join(out,name));
for(const name of ['icons','vendor'])await cp(path.join(root,name),path.join(out,name),{recursive:true});
let html=await readFile(path.join(out,'index.html'),'utf8');
html=html.replace('<script src="app.js"></script>','<script src="native-tracking.js"></script>\n  <script src="app.js"></script>');
await writeFile(path.join(out,'index.html'),html);
// Adapter is added only to the APK; ordinary browser installations stay intact.
try{await copyFile(path.join(root,'native-tracking.js'),path.join(out,'native-tracking.js'));}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(path.join(out,'native-tracking.js'),'window.NativeTracking = null;\n');}
console.log('Prepared Android web assets from public application sources only.');
