#!/usr/bin/env node
import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export function ensureProfilePrivateRoot(deployPath) {
  if (!isAbsolute(deployPath) || resolve(deployPath)!==deployPath || realpathSync(deployPath)!==deployPath || deployPath==='/') throw Error('HR_PRIVATE_ROOT_INVALID');
  const root=join(dirname(deployPath),'.jinhu-hr-private-profile-input');
  try {mkdirSync(root,{mode:0o700});} catch(error){if(error.code!=='EEXIST')throw error;}
  const stat=lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root)!==root || (stat.mode&0o777)!==0o700) throw Error('HR_PRIVATE_ROOT_INVALID');
  return root;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {if(process.argv.length!==4 || process.argv[2]!=='--deploy')throw Error();ensureProfilePrivateRoot(process.argv[3]);}
  catch {process.stderr.write('HR_PRIVATE_ROOT_INVALID\n');process.exitCode=1;}
}
