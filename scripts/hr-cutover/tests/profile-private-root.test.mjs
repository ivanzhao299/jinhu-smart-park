import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureProfilePrivateRoot } from '../ensure-profile-private-root.mjs';

test('deployment creates only private sibling, preserves it and rejects unsafe existing root',()=>{
 const parent=realpathSync(mkdtempSync(join(tmpdir(),'hr-private-root-'))),deploy=join(parent,'deploy');mkdirSync(deploy,{mode:0o700});
 try {
  const root=ensureProfilePrivateRoot(deploy);assert.equal(root,join(parent,'.jinhu-hr-private-profile-input'));assert.equal(lstatSync(root).mode&0o777,0o700);
  const inode=lstatSync(root).ino;assert.equal(ensureProfilePrivateRoot(deploy),root);assert.equal(lstatSync(root).ino,inode);
  chmodSync(root,0o755);assert.throws(()=>ensureProfilePrivateRoot(deploy));assert.equal(lstatSync(root).mode&0o777,0o755);
  rmSync(root,{recursive:true});symlinkSync(deploy,root);assert.throws(()=>ensureProfilePrivateRoot(deploy));
  assert.throws(()=>ensureProfilePrivateRoot('/'));assert.throws(()=>ensureProfilePrivateRoot('relative'));
 }finally{rmSync(parent,{recursive:true,force:true});}
});
