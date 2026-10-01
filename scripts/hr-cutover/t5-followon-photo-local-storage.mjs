import { Buffer } from "node:buffer";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { hashT4 } from "./production-import-t4-followon-binding.mjs";

const fail = code => { throw Object.assign(new Error(code), { code }); };
/** The host must select the actual API storage root. The adapter only touches
 * this operation's new directory; it never overwrites or removes prior files. */
export function createT5LocalPhotoStorage(root) {
  if (!isAbsolute(root) || resolve(root) !== root || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    fail("T5_PHOTO_STORAGE_ROOT_INVALID");
  const directory = prepared => {
    if (!/^yuzhou-hr\/t5-photo\/yzprod-import-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/u.test(prepared.directory))
      fail("T5_PHOTO_STORAGE_PATH_INVALID");
    let current = root;
    for (const part of prepared.directory.split("/")) {
      current = resolve(current, part);
      if (existsSync(current) && (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink())) fail("T5_PHOTO_STORAGE_PATH_INVALID");
    }
    return current;
  };
  const verify = async prepared => {
    const destination = directory(prepared);
    if (!existsSync(destination)) return false;
    const expected = prepared.images.map(image => `${image.normalizedContentSha256}.jpg`).sort();
    if (JSON.stringify(readdirSync(destination).sort()) !== JSON.stringify(expected)) return false;
    for (const image of prepared.images) {
      const path = resolve(destination, `${image.normalizedContentSha256}.jpg`), info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size !== image.bytes
        || hashT4(readFileSync(path)) !== image.normalizedContentSha256) return false;
    }
    return true;
  };
  return {
    async put(prepared) {
      const destination = directory(prepared);
      mkdirSync(resolve(root, "yuzhou-hr/t5-photo"), { recursive: true, mode: 0o700 });
      mkdirSync(destination, { mode: 0o700 }); // Existing operation fails closed.
      try {
        for (const image of prepared.images) {
          if (!/^[a-f0-9]{64}$/u.test(image.normalizedContentSha256)) fail("T5_PHOTO_STORAGE_IMAGE_INVALID");
          const bytes = Buffer.from(image.base64, "base64");
          if (bytes.length !== image.bytes || hashT4(bytes) !== image.normalizedContentSha256) fail("T5_PHOTO_STORAGE_IMAGE_INVALID");
          writeFileSync(resolve(destination, `${image.normalizedContentSha256}.jpg`), bytes, { flag: "wx", mode: 0o600 });
        }
      } catch (error) {
        // This directory was created by this call, before any database commit.
        rmSync(destination, { recursive: true }); throw error;
      }
    },
    verify,
    async remove(prepared) {
      if (await verify(prepared) !== true) fail("T5_PHOTO_STORAGE_DRIFT");
      rmSync(directory(prepared), { recursive: true });
    },
  };
}
