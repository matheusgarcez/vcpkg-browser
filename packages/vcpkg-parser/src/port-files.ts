export const MAX_INLINE_PORT_FILE_BYTES = 64 * 1024;

export function classifyPortFilePath(filePath: string): string {
  if (filePath === "vcpkg.json" || filePath === "CONTROL") return "manifest";
  if (filePath === "portfile.cmake") return "portfile";
  if (filePath === "usage") return "usage";
  if (/\.(patch|diff)$/i.test(filePath)) return "patch";
  return "file";
}

export function isLikelyTextBuffer(buffer: Uint8Array): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));

  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
  }

  let suspicious = 0;
  for (const byte of sample) {
    const isCommonWhitespace = byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d;
    const isPrintableAscii = byte >= 0x20 && byte <= 0x7e;
    const isExtendedByte = byte >= 0x80;

    if (!isCommonWhitespace && !isPrintableAscii && !isExtendedByte) {
      suspicious++;
    }
  }

  return suspicious <= Math.max(1, Math.floor(sample.length * 0.1));
}
