"""Patch the AnranS WeChat preview SDK's persistent-file restore."""

import argparse
from hashlib import sha256
import json
from pathlib import Path


SDK = "js/libs/sdk.js"

RESTORE_READER = '''  async _readRestoredFile(fs, path, size) {
    // WeChat can reject a read at offset zero when the file has no bytes.
    if (size === 0) return new Uint8Array(0);
    const read = async () => {
      const file = await _fsCall(fs, "readFile", { filePath: path });
      const bytes = _arrayBufferBytes(file.data);
      if (!bytes) throw new Error("FileSystemManager.readFile returned non-binary data");
      return bytes;
    };
    try {
      return await read();
    } catch (error) {
      if (!this._isRestoreReadRangeError(error)) throw error;
    }
    // The host file may have been truncated since the first stat.
    const result = await this._stat(fs, path);
    const stats = result.stats || result.stat || result;
    return stats.size === 0 ? new Uint8Array(0) : read();
  }

  _isRestoreReadRangeError(error) {
    return /readFile:fail.*\\bposition\\b.*out of range/i.test(error.message);
  }

'''


def replace_once(source, before, after):
    if after in source:
        return source
    if source.count(before) != 1:
        raise ValueError(f"Unexpected WeChat SDK revision near {before.splitlines()[0]!r}")
    return source.replace(before, after, 1)


def patch(source):
    before = '  async copyLocalToFS(path) {\n'
    source = replace_once(source, before, RESTORE_READER + before)

    before = '      const statResult = await this._stat(fs, platformPath);'
    source = replace_once(source, before, '''      let statResult;
      try {
        statResult = await this._stat(fs, platformPath);
      } catch (error) {
        if (_isMissingHostPath(error)) continue;
        throw error;
      }''')

    before = '''        const file = await _fsCall(fs, "readFile", { filePath: platformPath });
        const bytes = _arrayBufferBytes(file.data);
        if (!bytes) {
          throw new Error(`FileSystemManager.readFile returned non-binary data for ${child}`);
        }'''
    source = replace_once(source, before, '''        let bytes;
        try {
          bytes = await this._readRestoredFile(fs, platformPath, stats.size);
        } catch (error) {
          if (_isMissingHostPath(error)) continue;
          if (!this._isRestoreReadRangeError(error)) throw error;
          const unreadable = this._persistentUnreadablePaths || (this._persistentUnreadablePaths = new Set());
          unreadable.add(child);
          console.warn(`[RedFlower] Preserved unreadable host file during restore: ${child}`);
          continue;
        }
        if (this._persistentUnreadablePaths) this._persistentUnreadablePaths.delete(child);''')

    before = '    const snapshot = new Map();'
    source = replace_once(source, before, '''    const unreadable = this._persistentUnreadablePaths;
    const snapshot = new Map();''')
    before = '      snapshot.set(virtualPath, readFile);'
    source = replace_once(source, before, '      if (!unreadable || !unreadable.has(virtualPath)) snapshot.set(virtualPath, readFile);')
    before = '      .filter((path) => contains(path) && !snapshot.has(path));'
    return replace_once(source, before, '      .filter((path) => contains(path) && !snapshot.has(path) && (!unreadable || !unreadable.has(path)));')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    package = parser.parse_args().package
    sdk = package / SDK
    metadata = package / ".godot-mini-game-export.json"
    report = json.loads(metadata.read_bytes())
    fixed = patch(sdk.read_text(encoding="utf-8")).encode("utf-8")
    report["output_artifacts"][SDK] = {"size": len(fixed), "sha256": sha256(fixed).hexdigest()}
    sdk.write_bytes(fixed)
    metadata.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
