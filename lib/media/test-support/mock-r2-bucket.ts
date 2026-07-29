/**
 * A tiny in-memory stand-in for R2Bucket, used only by tests — the Stage
 * 2D brief explicitly wants unit/e2e tests to run without production R2
 * (or even local Miniflare storage): "Использовать mock R2 bucket или
 * локальное Miniflare/Wrangler storage". This implements exactly the
 * methods lib/media/*'s routes call (put/get/head/delete) plus enough of
 * R2Object's shape (key/size/etag/httpEtag/httpMetadata) to exercise the
 * real header-building logic; every other R2Bucket method throws if
 * accidentally called, so a test relying on unimplemented behavior fails
 * loudly instead of silently no-op'ing.
 */
interface StoredObject {
  body: ArrayBuffer;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  etag: string;
  uploaded: Date;
}

function toArrayBuffer(value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null): Promise<ArrayBuffer> {
  if (value === null) return Promise.resolve(new ArrayBuffer(0));
  if (typeof value === 'string') return Promise.resolve(new TextEncoder().encode(value).buffer as ArrayBuffer);
  if (value instanceof ArrayBuffer) return Promise.resolve(value);
  if (ArrayBuffer.isView(value)) return Promise.resolve(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer);
  if (value instanceof Blob) return value.arrayBuffer();
  throw new Error('MockR2Bucket.put: unsupported value type in tests (ReadableStream not implemented)');
}

function fakeEtag(): string {
  return Math.random().toString(16).slice(2).padEnd(32, '0');
}

function toR2Object(key: string, stored: StoredObject, range?: { offset: number; length: number }): R2Object {
  const size = range ? range.length : stored.body.byteLength;
  return {
    key,
    version: '1',
    size,
    etag: stored.etag,
    httpEtag: `"${stored.etag}"`,
    checksums: {} as R2Checksums,
    uploaded: stored.uploaded,
    httpMetadata: stored.httpMetadata,
    customMetadata: stored.customMetadata,
    range,
    storageClass: 'Standard',
    writeHttpMetadata() {
      throw new Error('MockR2Bucket: writeHttpMetadata not implemented in tests');
    },
  } as R2Object;
}

export class MockR2Bucket implements R2Bucket {
  private store = new Map<string, StoredObject>();

  /** Test-only convenience: wipe all stored objects between test cases. */
  reset(): void {
    this.store.clear();
  }

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: R2PutOptions,
  ): Promise<R2Object> {
    const body = await toArrayBuffer(value);
    const stored: StoredObject = {
      body,
      httpMetadata: options?.httpMetadata as R2HTTPMetadata | undefined,
      customMetadata: options?.customMetadata,
      etag: fakeEtag(),
      uploaded: new Date(),
    };
    this.store.set(key, stored);
    return toR2Object(key, stored);
  }

  async head(key: string): Promise<R2Object | null> {
    const stored = this.store.get(key);
    return stored ? toR2Object(key, stored) : null;
  }

  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null> {
    const stored = this.store.get(key);
    if (!stored) return Promise.resolve(null);

    const range = options?.range && !(options.range instanceof Headers) ? normalizeRange(options.range, stored.body.byteLength) : undefined;
    const bodyBuffer = range ? stored.body.slice(range.offset, range.offset + range.length) : stored.body;
    const base = toR2Object(key, stored, range);

    const objectBody: R2ObjectBody = {
      ...base,
      writeHttpMetadata() {
        throw new Error('MockR2Bucket: writeHttpMetadata not implemented in tests');
      },
      get body() {
        return new Response(bodyBuffer).body as ReadableStream;
      },
      get bodyUsed() {
        return false;
      },
      arrayBuffer: async () => bodyBuffer,
      bytes: async () => new Uint8Array(bodyBuffer),
      text: async () => new TextDecoder().decode(bodyBuffer),
      json: async <T>() => JSON.parse(new TextDecoder().decode(bodyBuffer)) as T,
      blob: async () => new Blob([bodyBuffer]),
    };
    return Promise.resolve(objectBody);
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.store.delete(key);
    }
  }

  createMultipartUpload(): Promise<R2MultipartUpload> {
    throw new Error('MockR2Bucket: createMultipartUpload not implemented in tests');
  }

  resumeMultipartUpload(): R2MultipartUpload {
    throw new Error('MockR2Bucket: resumeMultipartUpload not implemented in tests');
  }

  list(): Promise<R2Objects> {
    throw new Error('MockR2Bucket: list not implemented in tests');
  }
}

function normalizeRange(range: R2Range, size: number): { offset: number; length: number } {
  if ('suffix' in range) {
    const offset = Math.max(size - range.suffix, 0);
    return { offset, length: size - offset };
  }
  const offset = range.offset ?? 0;
  const length = range.length ?? size - offset;
  return { offset, length };
}
