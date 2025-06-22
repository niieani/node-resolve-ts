// @ts-check
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";

/** @type {Record<string, string>} */
const extensionMap = {
  ".js": ".ts",
  ".mjs": ".mts",
  ".cjs": ".cts",
};

/** @type {Record<string, string>} */
const moduleFormatMap = {
  ".ts": "module-typescript",
  ".mts": "module-typescript",
  ".cts": "commonjs-typescript",
};

/**
 * NodeJS hook to resolve different file extensions for imports based on the
 * extension map.
 *
 * Supports `node --experimental-strip-types` where ESM needs extensions and TS
 * expects you to use `.js` extensions, which Node will fail to resolve.
 * @type {import("node:module").ResolveHook}
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    // try default resolution first
    return await nextResolve(specifier, context);
  } catch (error) {
    // If we failed with ERR_MODULE_NOT_FOUND,
    // let's try rewriting the extension and resolving again
    const failedSpecifier = getFailedResolvePath(error);
    if (failedSpecifier) {
      // Extract the URL that failed and try TypeScript alternatives
      const ext = extname(failedSpecifier);
      const tsExt = extensionMap[ext];

      const tsPath =
        failedSpecifier.slice(0, failedSpecifier.length - ext.length) + tsExt;
      const exists = await stat(tsPath).catch(() => false);
      if (exists) {
        return {
          shortCircuit: true,
          url: pathToFileURL(tsPath).href,
          format: moduleFormatMap[tsExt],
        };
      }
    }
    throw error;
  }
}

const ERROR_PATH_REGEXP = /Cannot find (package|module) '(?<path>[^']+)'/;

/**
 * Extracts the failed module path from an error instance.
 * @param {Error & {code?: string; url?: string}} error
 * @returns {string | undefined}
 */
function getFailedResolvePath(error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") {
    return undefined;
  }
  if (typeof error.url === "string") {
    return error.url.replace("file://", "");
  }
  // unfortunately Node isn't consistent with setting the 'url' property on the error
  // specifically if we bump into legacy logic: https://github.com/nodejs/node/blob/eafbe277b00d3a0f37252c7fe6d7a354c31efed1/src/node_file.cc#L3765-L3768
  // hence we fallback to parsing the path from the error message
  const match = error.message.match(ERROR_PATH_REGEXP);
  if (match && match.groups && match.groups.path) {
    return match.groups.path;
  }
  return undefined;
}
