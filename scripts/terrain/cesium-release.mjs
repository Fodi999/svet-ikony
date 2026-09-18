import {createHash} from 'node:crypto';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getPlatformProxy} from 'wrangler';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = path.join(root, 'tools/terrain/cesium/build');
const upload = process.argv.includes('--upload');
const bucketIndex = process.argv.indexOf('--bucket');
const bucket = bucketIndex >= 0 ? process.argv[bucketIndex + 1] : null;
if (upload && bucket !== 'svetikony-media') throw new Error('Explicit --bucket svetikony-media required');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = /^(?:nasa\/\d+\/\d+\/\d+\.jpg|sentinel\/\d+\/\d+\/\d+\.png|alps-(?:heightmap|quantized)\/(?:layer\.json|\d+\/\d+\/\d+\.terrain))$/;
const files = [];
async function walk(directory, prefix = '') {
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlink forbidden: ${relative}`);
    if (entry.isDirectory()) await walk(path.join(directory,entry.name), relative + '/');
    else if (allowed.test(relative)) {
      const bytes = await readFile(path.join(build,relative));
      if (!bytes.length) throw new Error(`Empty asset: ${relative}`);
      files.push({path:relative,size:bytes.length,sha256:hash(bytes)});
    }
  }
}
await walk(build);
files.sort((a,b) => a.path.localeCompare(b.path,'en'));
for (const required of ['nasa/0/0/0.jpg','nasa/0/1/0.jpg','alps-heightmap/layer.json']) {
  if (!files.some(file => file.path === required)) throw new Error(`Missing ${required}`);
}
const manifest = {schemaVersion:1,files};
const bytes = Buffer.from(JSON.stringify(manifest));
const release = hash(bytes), prefix = `cesium/releases/${release}/`;
const output = path.join(root,'tools/terrain/cesium/releases',release);
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'manifest.json'),bytes);
console.log(JSON.stringify({mode:upload?'upload':'dry-run',release,files:files.length,bytes:files.reduce((sum,file)=>sum+file.size,0),manifest:path.join(output,'manifest.json')},null,2));
if (upload) {
  const configPath=path.join(output,'upload.json');
  await writeFile(configPath,JSON.stringify({name:'svet-cesium-release',account_id:'85f883abad6bd698b35937b7d81bb556',compatibility_date:'2026-06-25',r2_buckets:[{binding:'RELEASE_BUCKET',bucket_name:bucket,remote:true}]}));
  const proxy=await getPlatformProxy({configPath,persist:false,envFiles:[],remoteBindings:true});
  try {
  const target=proxy.env.RELEASE_BUCKET;
  async function retry(operation) {
    for(let attempt=0;;attempt++) {
      try {return await operation();}
      catch(error) {
        if(attempt>=4)throw error;
        await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));
      }
    }
  }
  let completed=0, cursor=0;
  async function worker() {
  while(cursor<files.length) {
    const file=files[cursor++];
    const local = path.join(build,file.path);
    const content=await readFile(local);
    if (hash(content) !== file.sha256) throw new Error(`Asset changed: ${file.path}`);
    const key = `${prefix}data/${file.path}`;
    const type = file.path.endsWith('.jpg')?'image/jpeg':file.path.endsWith('.png')?'image/png':file.path.endsWith('.json')?'application/json':'application/octet-stream';
    await retry(async()=>{
      const existing=await target.head(key);
      if(!existing)await target.put(key,content,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:type},customMetadata:{sha256:file.sha256}});
      const readback=await target.get(key);
      if (!readback || hash(Buffer.from(await readback.arrayBuffer())) !== file.sha256) throw new Error(`Readback mismatch: ${file.path}`);
    });
    if(++completed%50===0)console.log(`Verified ${completed}/${files.length}`);
  }
  }
  const results=await Promise.allSettled(Array.from({length:4},()=>worker()));
  const failure=results.find(result=>result.status==='rejected');
  if(failure)throw failure.reason;
  await retry(()=>target.put(`${prefix}READY.json`,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));
  console.log(`Ready: ${release}. Engine activation and deployment are separate steps.`);
  } finally {await proxy.dispose();}
}
