import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { readFileSync } from "node:fs";
const limits=JSON.parse(readFileSync(new URL("../../packages/shared/src/hr-yuzhou-incremental-limits.json",import.meta.url),"utf8"));
export const YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES=limits.maxPackageBytes;
export const YUZHOU_INCREMENTAL_MAX_ITEMS=limits.maxItems;
export const serializeIncrementalPackage=pkg=>`${JSON.stringify(pkg)}\n`;
export const incrementalPackageBytes=pkg=>Buffer.byteLength(serializeIncrementalPackage(pkg),"utf8");

/** Exact UTF-8 compact JSON + newline, including witness, envelope and batch suffix. */
export function splitYuzhouIncrementalPackage(pkg,{alwaysSuffix=false}={}) {
  if(!pkg.items.length)return [];
  if(!alwaysSuffix && pkg.items.length<=limits.maxItems && incrementalPackageBytes(pkg)<=limits.maxPackageBytes)return [pkg];
  const output=[];
  let current,bytes;
  const start=()=>{
    const manifestId=`${pkg.manifestId}-batch-${String(output.length+1).padStart(4,"0")}`;
    if(manifestId.length>128)throw new Error("YUZHOU_INCREMENTAL_MANIFEST_ID_TOO_LONG");
    current={...pkg,manifestId,items:[]};bytes=incrementalPackageBytes(current);
  };
  start();
  for(const item of pkg.items) {
    const itemBytes=Buffer.byteLength(JSON.stringify(item),"utf8");
    if(current.items.length && (current.items.length===limits.maxItems || bytes+1+itemBytes>limits.maxPackageBytes)) {output.push(current);start();}
    const addition=itemBytes+(current.items.length?1:0);
    if(bytes+addition>limits.maxPackageBytes)throw new Error("YUZHOU_INCREMENTAL_SINGLE_ITEM_EXCEEDS_BYTE_LIMIT");
    current.items.push(item);bytes+=addition;
  }
  if(current.items.length)output.push(current);
  return output;
}
