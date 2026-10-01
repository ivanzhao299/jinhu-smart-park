import { spawnSync } from "node:child_process";
import { createT5LocalPhotoStorage } from "./t5-followon-photo-local-storage.mjs";

// Run the reviewed storage adapter inside the real API container. Its existing
// FILE_STORAGE_LOCAL_ROOT and Docker volume are authoritative; no host path or
// substitute upload root is accepted from an import packet.
export const T5_API_PHOTO_STORAGE_SCRIPT = `
const {Buffer}=require('node:buffer');const {createHash}=require('node:crypto');
const {existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync}=require('node:fs');
const {isAbsolute,resolve}=require('node:path');
const fail=code=>{throw Object.assign(new Error(code),{code})};
const hashT4=bytes=>createHash('sha256').update(bytes).digest('hex');
const createT5LocalPhotoStorage=(${createT5LocalPhotoStorage.toString()});
(async()=>{const input=JSON.parse(readFileSync(0,'utf8'));
if(!['put','verify','remove'].includes(input.mode))fail('T5_PHOTO_STORAGE_MODE_INVALID');
const storage=createT5LocalPhotoStorage(resolve(process.env.FILE_STORAGE_LOCAL_ROOT||'storage/files'));
const result=await storage[input.mode](input.prepared);
process.stdout.write(JSON.stringify({status:'PASS',verified:input.mode==='verify'?result:null}));
})().catch(error=>{process.stdout.write(JSON.stringify({status:'HOLD',code:/^T5_[A-Z0-9_]+$/.test(error.code||'')?error.code:'T5_PHOTO_STORAGE_FAILED'}));process.exitCode=1});
`;

export function createT5ApiContainerPhotoStorage() {
  const run = (mode, prepared) => {
    const result = spawnSync("docker", ["--host", "unix:///var/run/docker.sock", "exec", "-i", "jinhu-smart-park-prod-api", "node", "-e", T5_API_PHOTO_STORAGE_SCRIPT],
      { input: JSON.stringify({ mode, prepared }), encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 120000 });
    let response;
    try { response = JSON.parse(result.stdout); } catch { /* No raw Docker output leaves custody. */ }
    if (result.status !== 0 || response?.status !== "PASS") {
      const code = /^T5_[A-Z0-9_]+$/u.test(response?.code ?? "") ? response.code : "T5_PHOTO_STORAGE_FAILED";
      throw Object.assign(new Error(code), { code });
    }
    return mode === "verify" ? response.verified === true : undefined;
  };
  return { async put(prepared) { return run("put", prepared); },
    async verify(prepared) { return run("verify", prepared); }, async remove(prepared) { return run("remove", prepared); } };
}
