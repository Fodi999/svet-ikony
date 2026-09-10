// Deterministic SVG artwork and PNG/ICO exports. Requires ImageMagick (`magick`).
import sharp from 'sharp';
import {writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const gold='#E8CB7C', background='#0B0B0A';
function artwork({tile=false,maskable=false,small=false}={}) {
 const stroke=small?7:4;
 const mark=`<g fill="none" stroke="${gold}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="M22 87V39a28 28 0 0 1 56 0v48"/><path d="M50 32v47M42 39h16M36 49h28M41 64l18 9"/></g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${tile?`<rect width="100" height="100" fill="${background}"/>`:''}${maskable?`<g transform="translate(10 10) scale(.8)">${mark}</g>`:mark}</svg>\n`;
}
const temp=mkdtempSync(join(tmpdir(),'svetikony-brand-'));
try {
 writeFileSync('public/brand-logo-mark.svg',artwork());
 writeFileSync('public/favicon.svg',artwork({tile:true,small:true}));
 for(const [path,size,maskable,small] of [
 ['apple-touch-icon.png',180,false,false],['pwa/apple-touch-icon.png',180,false,false],
 ['pwa/app-icon-192.png',192,false,false],['pwa/app-icon-512.png',512,false,false],
 ['pwa/app-icon-maskable-512.png',512,true,false],['favicon-512.png',512,false,false],
 ['favicon-32.png',32,false,true],['favicon-16.png',16,false,true]]) {
  const source=join(temp,'source.svg');writeFileSync(source,artwork({tile:true,maskable,small}));
  await sharp(Buffer.from(artwork({tile:true,maskable,small})),{density:576}).resize(size,size).flatten({background}).png().toFile(`public/${path}`);
 }
 execFileSync('magick',['public/favicon-16.png','public/favicon-32.png','public/favicon.ico']);
} finally {rmSync(temp,{recursive:true,force:true});}
