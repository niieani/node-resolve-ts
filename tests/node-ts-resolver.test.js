import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCb);

describe("node-ts-resolver", () => {
  test("Node raises ERR_MODULE_NOT_FOUND without this resolver", async () => {
    await assert.rejects(
      () =>
        exec("node --experimental-strip-types main.ts", {
          encoding: "utf8",
        }),
      /ERR_MODULE_NOT_FOUND/,
    );
  });

  describe("allows Typescript code to run with .js imports", () => {
    const commands = [
      {
        command:
          "node --experimental-strip-types --import node-ts-resolver/strip main.ts",
        stdout: /^main\.ts: 3$/,
      },
      {
        command:
          "node --experimental-strip-types --import node-ts-resolver/strip mts/main.mts",
        stdout: /^main\.mts: 3$/,
      },
      {
        command: "node --experimental-strip-types entry.ts",
        stdout: /^main\.ts: 3$/,
      },
    ];

    for (const { command, stdout: expectedStdout } of commands) {
      test(command, async () => {
        const { stdout: actualStdout } = await exec(command, {
          encoding: "utf8",
          timeout: 1000,
          env: { ...process.env, NODE_NO_WARNINGS: "1" },
        });
        assert.match(actualStdout, expectedStdout);
      });
    }
  });

  describe("prefers JS over TS", () => {
    const commands = [
      {
        command:
          "node --experimental-strip-types --import node-ts-resolver/strip js-preference/main.ts",
        stdout: /^from JS$/,
      },
    ];

    for (const { command, stdout: expectedStdout } of commands) {
      test(command, async () => {
        const { stdout: actualStdout } = await exec(command, {
          encoding: "utf8",
          timeout: 1000,
          env: { ...process.env, NODE_NO_WARNINGS: "1" },
        });
        assert.match(actualStdout, expectedStdout);
      });
    }
  });

  describe("handles non-relative imports with TypeScript resolution", () => {
    test("resolves package imports with .js to .ts", async () => {
      const { stdout } = await exec(
        "node --experimental-strip-types --import node-ts-resolver/strip test-non-relative.ts",
        {
          encoding: "utf8",
          timeout: 1000,
          env: { ...process.env, NODE_NO_WARNINGS: "1" },
        },
      );
      assert.match(stdout, /non-relative import: from TypeScript package/);
    });
  });
});
