import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CD_HEADER_SIG = 0x02014b50;
const LOCAL_HEADER_SIG = 0x04034b50;

/**
 * Zero-dependency ZIP Central Directory + inflateRawSync parser.
 * Returns Map<fileName, { name, compressionMethod, compressedSize, uncompressedSize, data, text, sha256 }>.
 */
export function parseZipEntries(buffer) {
  assert.ok(
    Buffer.isBuffer(buffer) && buffer.length >= 22,
    'ZIP payload must be a non-empty Buffer (>= 22 bytes)',
  );

  // Locate End of Central Directory (EOCD) scanning backwards
  const minOffset = Math.max(0, buffer.length - 65557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIG) {
      eocdOffset = offset;
      break;
    }
  }
  assert.notEqual(
    eocdOffset,
    -1,
    'Invalid ZIP archive: End of Central Directory (EOCD) signature not found',
  );

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries = new Map();
  let cursor = cdOffset;

  for (let i = 0; i < entryCount; i++) {
    assert.ok(
      cursor + 46 <= buffer.length &&
        buffer.readUInt32LE(cursor) === CD_HEADER_SIG,
      `Invalid ZIP Central Directory header at entry ${i} (offset ${cursor})`,
    );

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);

    const name = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLen)
      .toString('utf8');

    assert.ok(
      localHeaderOffset + 30 <= buffer.length &&
        buffer.readUInt32LE(localHeaderOffset) === LOCAL_HEADER_SIG,
      `Invalid ZIP Local File Header for "${name}" at offset ${localHeaderOffset}`,
    );

    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawSlice = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (compressionMethod === 0) {
      data = Buffer.from(rawSlice);
    } else if (compressionMethod === 8) {
      data = zlib.inflateRawSync(rawSlice);
    } else {
      assert.fail(
        `Unsupported ZIP compression method ${compressionMethod} for "${name}"`,
      );
    }

    const sha256 = crypto.createHash('sha256').update(data).digest('hex');

    entries.set(name, {
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      data,
      text: data.toString('utf8'),
      sha256,
    });

    cursor += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Validates an RO-Crate 1.1 ZIP bundle and returns parsed entries + metadata JSON-LD.
 */
export function validateRoCrateZip(buffer, tag = 'F12/M4') {
  const entries = parseZipEntries(buffer);
  const metadataEntry = entries.get('ro-crate-metadata.json');
  assert.ok(
    metadataEntry,
    `[${tag}] RO-Crate ZIP missing required "ro-crate-metadata.json". Entries found: ${[...entries.keys()].join(', ')}`,
  );

  let metadata;
  try {
    metadata = JSON.parse(metadataEntry.text);
  } catch (err) {
    assert.fail(
      `[${tag}] "ro-crate-metadata.json" is not valid JSON: ${err.message}`,
    );
  }

  const contextStr = JSON.stringify(metadata['@context'] || '');
  assert.ok(
    contextStr.includes('ro/crate/1.1'),
    `[${tag}] RO-Crate "@context" must reference RO-Crate 1.1, got: ${contextStr}`,
  );

  assert.ok(
    Array.isArray(metadata['@graph']) && metadata['@graph'].length >= 2,
    `[${tag}] RO-Crate "@graph" must be an array with metadata descriptor and root dataset`,
  );

  const hasDescriptor = metadata['@graph'].some(
    (node) => node && node['@id'] === 'ro-crate-metadata.json',
  );
  const hasRoot = metadata['@graph'].some(
    (node) => node && node['@id'] === './',
  );
  assert.ok(
    hasDescriptor && hasRoot,
    `[${tag}] RO-Crate "@graph" must include both "ro-crate-metadata.json" and "./" root dataset nodes`,
  );

  return { entries, metadata };
}
