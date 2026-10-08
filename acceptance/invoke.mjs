import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [directory,method]=process.argv.slice(2);
const args=JSON.parse(readFileSync(0,'utf8'),(_,value)=>value && typeof value==='object' && '$number' in value?Number(value.$number):value);
const stringify=JSON.stringify.bind(JSON);
const write=process.stdout.write.bind(process.stdout);
const send=value=>write(stringify(value)+'\n');
try {
  const api=await import(pathToFileURL(resolve(directory,'src/main.mjs')));
  const result=api[method](...args);
  send({ok:true,value:result,args});
} catch(error) { send({ok:false,error:{name:error.name,message:error.message}}); }
