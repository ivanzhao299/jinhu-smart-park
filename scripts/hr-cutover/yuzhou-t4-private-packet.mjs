/* global Buffer, process */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, closeSync, constants, fstatSync, openSync, readSync, writeFileSync, readFileSync, mkdirSync, rmSync, cpSync, realpathSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

export const EXECUTOR_SHA = '1cd835597291b395083f63a2a6f5c8f47757b65b';
const MAGIC = Buffer.from('JHYZPK01');
const LIMIT = 2_000_000_000;
export const fail = code => { throw Object.assign(new Error(code), { code }); };
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function nonceRoot(nonce) {
  if (!/^[0-9a-f]{32}$/u.test(nonce ?? '')) fail('TRANSPORT_NONCE_INVALID');
  return `/tmp/jinhu-yuzhou-t4-${nonce}`;
}
export function privateInfo(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = fstatSync(fd);
    if (!s.isFile() || s.nlink !== 1 || (s.mode & 0o777) !== 0o600 || s.uid !== process.getuid() || s.size > LIMIT) fail('TRANSPORT_PRIVATE_FILE_UNSAFE');
    return s;
  } finally { closeSync(fd); }
}
export async function fileHash(path) {
  privateInfo(path);
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path, { flags: constants.O_RDONLY | constants.O_NOFOLLOW })) h.update(chunk);
  return h.digest('hex');
}
export function writePrivate(path, value) {
  writeFileSync(path, typeof value === 'string' || Buffer.isBuffer(value) ? value : `${JSON.stringify(value)}\n`, { mode: 0o600, flag: 'wx' });
}
function visitDescriptors(value, transform) {
  if (Array.isArray(value)) return value.map(item => visitDescriptors(item, transform));
  if (value && typeof value === 'object') {
    if (Object.hasOwn(value, 'path')) {
      if (Object.keys(value).sort().join(',') !== 'path,sha256' || !/^[a-f0-9]{64}$/u.test(value.sha256)) fail('TRANSPORT_DESCRIPTOR_INVALID');
      return transform(value);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visitDescriptors(item, transform)]));
  }
  return value;
}
export function validateManifest(m, nonce) {
  nonceRoot(nonce);
  if (m?.version !== 1 || m.codeSha !== EXECUTOR_SHA || m.nonce !== nonce || !['probe', 'import'].includes(m.kind) || !Array.isArray(m.files) || m.files.length > 64) fail('TRANSPORT_MANIFEST_INVALID');
  let total = 0;
  for (const [i, file] of m.files.entries()) {
    if (file.name !== `artifact-${i}.bin` || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !/^[a-f0-9]{64}$/u.test(file.sha256)) fail('TRANSPORT_FILE_INVALID');
    total += file.bytes;
  }
  if (total > LIMIT) fail('TRANSPORT_BUDGET_EXCEEDED');
  if (m.kind === 'probe' && (m.files.length || m.materials !== null)) fail('TRANSPORT_PROBE_INVALID');
  if (m.kind === 'import') visitDescriptors(m.materials, d => {
    if (!m.files.some(f => f.name === d.path && f.sha256 === d.sha256)) fail('TRANSPORT_DESCRIPTOR_INVALID');
    return d;
  });
  return total;
}
export function copyPgTree(executor, destination) {
  mkdirSync(destination, { mode: 0o700 });
  const seen = new Map();
  function copy(name, from) {
    const require = createRequire(resolve(from, 'package.json'));
    // Some dependencies hide package.json behind exports. Resolve their actual
    // entry point, then locate the owning package without bypassing Node's
    // package resolution or copying the entire workspace dependency tree.
    let source = dirname(realpathSync(require.resolve(name)));
    while (!existsSync(resolve(source, 'package.json')) || JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8')).name !== name) {
      const parent = dirname(source);
      if (parent === source) fail('TRANSPORT_DRIVER_PACKAGE_INVALID');
      source = parent;
    }
    if (seen.has(name)) {
      if (seen.get(name) !== source) fail('TRANSPORT_DRIVER_VERSION_CONFLICT');
      return;
    }
    seen.set(name, source);
    cpSync(source, resolve(destination, name), { recursive: true, dereference: true, filter: path => {
      if (path.endsWith('.node')) fail('TRANSPORT_NATIVE_DRIVER_REJECTED');
      return !path.includes('/node_modules/', source.length);
    } });
    const pkg = JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8'));
    for (const dep of Object.keys(pkg.dependencies ?? {})) copy(dep, source);
  }
  copy('pg', executor);
}

export async function pack(request, output) {
  mkdirSync(output, { mode: 0o700 });
  const nonce = randomBytes(16).toString('hex');
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const sources = [];
  try {
    if (!['probe', 'import'].includes(request.kind)) fail('TRANSPORT_REQUEST_INVALID');
    const materials = request.kind === 'probe' ? null : visitDescriptors(request.materials, d => {
      if (resolve(d.path) !== d.path) fail('TRANSPORT_PATH_INVALID');
      const info = privateInfo(d.path);
      const name = `artifact-${sources.length}.bin`;
      sources.push({ source: d.path, name, bytes: info.size, sha256: d.sha256 });
      return { path: name, sha256: d.sha256 };
    });
    for (const f of sources) if (await fileHash(f.source) !== f.sha256) fail('TRANSPORT_SOURCE_HASH_MISMATCH');
    const manifest = { version: 1, codeSha: EXECUTOR_SHA, nonce, kind: request.kind, files: sources.map(f => ({ name: f.name, bytes: f.bytes, sha256: f.sha256 })), materials };
    validateManifest(manifest, nonce);
    const metadata = Buffer.from(JSON.stringify(manifest));
    if (metadata.length > 1024 * 1024) fail('TRANSPORT_MANIFEST_INVALID');
    const size = Buffer.alloc(4); size.writeUInt32BE(metadata.length);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${EXECUTOR_SHA}:${nonce}`));
    const packet = resolve(output, 'packet.bin');
    writePrivate(packet, Buffer.concat([MAGIC, iv]));
    async function* contents() {
      yield size; yield metadata;
      for (const f of sources) yield* createReadStream(f.source, { flags: constants.O_RDONLY | constants.O_NOFOLLOW });
    }
    await pipeline(Readable.from(contents()), cipher, createWriteStream(packet, { flags: 'a', mode: 0o600 }));
    writeFileSync(packet, cipher.getAuthTag(), { flag: 'a', mode: 0o600 });
    writePrivate(resolve(output, 'transport-key.txt'), key.toString('hex'));
    const receipt = { code: 'TRANSPORT_PACKET_READY', codeSha: EXECUTOR_SHA, nonce, packetSha256: await fileHash(packet), artifactCount: sources.length };
    writePrivate(resolve(output, 'transport-receipt.json'), receipt);
    return receipt;
  } finally { key.fill(0); }
}
export async function unpack(packet, keyFile, nonce, expectedHash, destination) {
  if (!/^[a-f0-9]{64}$/u.test(expectedHash ?? '') || await fileHash(packet) !== expectedHash) fail('TRANSPORT_PACKET_HASH_MISMATCH');
  privateInfo(keyFile);
  const keyText = readFileSync(keyFile, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/u.test(keyText)) fail('TRANSPORT_KEY_INVALID');
  const key = Buffer.from(keyText, 'hex');
  mkdirSync(destination, { mode: 0o700 });
  const plaintext = resolve(destination, 'authenticated.tmp');
  let fd;
  try {
    const size = privateInfo(packet).size;
    if (size < 40) fail('TRANSPORT_PACKET_INVALID');
    fd = openSync(packet, constants.O_RDONLY | constants.O_NOFOLLOW);
    const header = Buffer.alloc(20); readSync(fd, header, 0, 20, 0);
    const tag = Buffer.alloc(16); readSync(fd, tag, 0, 16, size - 16);
    if (!header.subarray(0, 8).equals(MAGIC)) fail('TRANSPORT_PACKET_INVALID');
    closeSync(fd); fd = undefined;
    const cipher = createDecipheriv('aes-256-gcm', key, header.subarray(8));
    cipher.setAAD(Buffer.from(`${EXECUTOR_SHA}:${nonce}`)); cipher.setAuthTag(tag);
    await pipeline(createReadStream(packet, { start: 20, end: size - 17 }), cipher, createWriteStream(plaintext, { mode: 0o600, flags: 'wx' }));
    fd = openSync(plaintext, constants.O_RDONLY | constants.O_NOFOLLOW);
    const prefix = Buffer.alloc(4); readSync(fd, prefix, 0, 4, 0);
    const length = prefix.readUInt32BE();
    if (length < 1 || length > 1024 * 1024) fail('TRANSPORT_MANIFEST_INVALID');
    const metadata = Buffer.alloc(length);
    if (readSync(fd, metadata, 0, length, 4) !== length) fail('TRANSPORT_PACKET_INVALID');
    const m = JSON.parse(metadata.toString('utf8'));
    const total = validateManifest(m, nonce);
    if (fstatSync(fd).size !== 4 + length + total) fail('TRANSPORT_PACKET_INVALID');
    closeSync(fd); fd = undefined;
    let position = 4 + length;
    for (const file of m.files) {
      const path = resolve(destination, file.name);
      await pipeline(createReadStream(plaintext, { start: position, end: position + file.bytes - 1 }), createWriteStream(path, { mode: 0o600, flags: 'wx' }));
      if (await fileHash(path) !== file.sha256) fail('TRANSPORT_ARTIFACT_HASH_MISMATCH');
      position += file.bytes;
    }
    m.materials = visitDescriptors(m.materials, d => ({ ...d, path: resolve(destination, d.path) }));
    writePrivate(resolve(destination, 'manifest.json'), m);
    return m;
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
    key.fill(0); rmSync(plaintext, { force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, request, output] = process.argv.slice(2);
    if (mode !== 'pack' || !request || !output) fail('TRANSPORT_ARGUMENT_INVALID');
    privateInfo(request);
    process.stdout.write(`${JSON.stringify(await pack(JSON.parse(readFileSync(request, 'utf8')), resolve(output)))}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify({ code: /^TRANSPORT_[A-Z_]+$/u.test(error.code ?? '') ? error.code : 'TRANSPORT_FAILED' })}\n`); process.exitCode = 1; }
}
