import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const directory=path.resolve(process.env.EARTH_ASSET_MODE==='local'?'.next-earth-preview/static':'.next/static');
let count=0;
async function check(root) {
  for(const entry of await readdir(root,{withFileTypes:true})) {
    const file=path.join(root,entry.name);
    if(entry.isDirectory())await check(file);
    else if(file.endsWith('.js')) {
      const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
      if(result.status!==0)throw new Error(`Invalid client JavaScript: ${file}\n${result.stderr}`);
      count++;
    }
  }
}
await check(directory);
console.log(`Client syntax verified: ${count} JavaScript files`);
