import {cp, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const base=path.join(root,'node_modules/@cesium/engine');
const output=path.join(root,'public/cesium-runtime/26.3.0');
await mkdir(output,{recursive:true});
for(const [name,source] of [['Workers','Build/Workers'],['ThirdParty','Build/ThirdParty'],['Assets','Source/Assets']]) {
  await cp(path.join(base,source),path.join(output,name),{recursive:true});
}
await cp(path.join(base,'LICENSE.md'),path.join(output,'LICENSE.md'));
