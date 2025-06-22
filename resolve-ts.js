import { stat } from "node:fs/promises";
import { resolve as resolvePath, dirname, extname } from "node:path";
import { pathToFileURL } from "node:url";

/** @type {Record<string, string[]>} */
let extensionMap = {};

/**
 * Initialises the extension mappings when these hooks are registered.
 * @param {typeof extensionMap} extMap An object mapping from import extension
 * to the ordered list of extensions to try resolving instead.
 * @example
 * register("./resolve-ts.js", import.meta.url, {
 *   // Prefer .ts files when available but fall back to .js
 *   data: {
 *     ".js": [".ts", ".js"],
 *     ".mjs": [".mts", ".mjs"],
 *     ".cjs": [".cts", ".cjs"],
 *   },
 * });
 */
export function initialize(extMap) {
  if (extMap) {
    extensionMap = extMap;
  }
}

/**
 * NodeJS hook to resolve different file extensions for imports based on the
 * extension map.
 *
 * Supports `node --experimental-strip-types` where ESM needs extensions and TS
 * expects you to use `.js` extensions, which Node will fail to resolve.
 * @type {import("node:module").ResolveHook}
 */
export async function resolve(specifier, context, nextResolve) {
  const { parentURL } = context;

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const ext = extname(specifier);
    const candidateExts = extensionMap[ext];

    if (candidateExts) {
      const resolved = await resolveFileWithExtensions(
        specifier.slice(0, specifier.length - ext.length),
        parentURL ? new URL(parentURL).pathname : ".",
        candidateExts
      );
      if (resolved) {
        return {
          shortCircuit: true,
          url: resolved.path,
          format: resolved.format,
        };
      }
    }
  }

  try {
    // For all paths (including non-relative), try default resolution first
    return await nextResolve(specifier, context);
  } catch (error) {
    // If we failed with ERR_MODULE_NOT_FOUND,
    // let's try rewriting the extension and resolving again
    const failedSpecifier = getFailedResolvePath(error);
    if (failedSpecifier) {
      // Extract the URL that failed and try TypeScript alternatives
      const ext = extname(failedSpecifier);
      const candidateExts = extensionMap[ext];

      const resolved = await resolveFileWithExtensions(
        failedSpecifier.slice(0, failedSpecifier.length - ext.length),
        parentURL ? new URL(parentURL).pathname : ".",
        candidateExts
      );
      if (resolved) {
        return {
          shortCircuit: true,
          url: resolved.path,
          format: resolved.format,
        };
      }
    }
    throw error;
  }
}

/** @type {Record<string, string>} */
const moduleFormatMap = {
  ".mjs": "module",
  ".mts": "module-typescript",
  ".cjs": "commonjs",
  ".cts": "commonjs-typescript",
  ".js": "module",
  ".ts": "module-typescript",
}

/** Attempts to resolve the file using specified extensions.
 * @param {string} specifierWithoutExt The module specifier without extension
 * @param {string} parentPath The path from which the module is
 * imported.
 * @param {string[]} extensions The ordered list of extensions to check.
 * @returns {Promise<string | undefined>} The resolved file URL, or undefined
 * if not found.
 */
async function resolveFileWithExtensions(
  specifierWithoutExt,
  parentPath,
  extensions
) {
  const parentDir = dirname(parentPath);
  const resolvedPathWithoutExt = resolvePath(parentDir, specifierWithoutExt);

  const candidates = await Promise.allSettled(
    extensions.map((ext) => stat(resolvedPathWithoutExt + ext))
  );

  let candidate;
  for (let i = 0; i < candidates.length; ++i) {
    candidate = candidates[i];
    if (candidate.status === "fulfilled" && candidate.value.isFile()) {
      return {
        path: pathToFileURL(resolvedPathWithoutExt + extensions[i]).href,
        format: moduleFormatMap[extensions[i]],
      }
    }
  }

  return undefined;
}

const ERROR_PATH_REGEXP = /Cannot find (package|module) '(?<path>[^']+)'/;

/**
 * Extracts the failed module path from an error instance.
 * @param {Error} error
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
