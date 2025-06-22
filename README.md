# Node TypeScript Resolver

This package enables Node.js to resolve TypeScript files the same way TypeScript does - allowing `.ts` files to be found when imported with `.js` extensions.
It works in conjunction with modern Node.js versions that support loading TypeScript files natively:
- **Node 22.6.0+**: `--experimental-strip-types`
- **Node 22.7.0+**: `--experimental-transform-types`
- **Node 23.6.0+**: Type stripping enabled by default (no flag needed)

It fully replaces the need for tools such as `ts-node` or `tsx`, and makes `node` behave more like `bun` when it comes to loading TypeScript files.

## The Problem

ESM requires full file extensions for module resolution. TypeScript follows the philosophy of [never transforming existing valid JavaScript constructs](https://github.com/microsoft/TypeScript/issues/40878#issuecomment-702353715), so it expects `.js` extensions in imports even when referencing `.ts` source files.

However, Node's native type handling doesn't resolve `.ts` files when you import with `.js` extensions, causing module resolution errors.

One workaround is to enable `allowImportingTsExtensions` in your `tsconfig.json`, and have your import statements use `.ts`. Unfortunately, this means the compiled output JavaScript files will have `.ts` extensions, which will not work after building (since after building the files will now have `.js` extensions), unless you then also enable `rewriteRelativeImportExtensions` to convert them back to `.js`.

This however requires you to use `tsc` as the compiler for `.ts` files, and only works for TypeScript files in your own project. It does not support resolving `.ts` files imported using absolute paths, path aliases, or from other packages, which is a common use case in monorepos.

### Example

Given these files:

```typescript
// add.ts
export const sum = (a: number, b: number): number => a + b;
```

```typescript
// main.ts
import { sum } from './add.js'; // despite .js extension, TypeScript actually resolves this to './add.ts'
console.log(sum(2, 3));
```

```bash
# This fails - Node can't find add.js when add.ts exists
node --experimental-strip-types main.ts
```

Results in:
```
node:internal/modules/esm/resolve:257
   throw new ERR_MODULE_NOT_FOUND(
          ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module './add.js' imported from ./main.ts
```

Whereas if you use this package, it resolves correctly:

```bash
node --experimental-strip-types --import node-ts-resolver/register main.ts

# Results in: 5
```

## Installation

Install the package in your project:

```bash
npm install node-ts-resolver
```

## Usage

### Basic Usage

Whenever running node, simply add `--import node-ts-resolver/strip` or `--import node-ts-resolver/transform` to your command.

For example that supports type stripping only:

```bash
node --experimental-strip-types --import node-ts-resolver/strip main.ts
```

With type transformations (enums, namespaces, etc.):

```bash
node --experimental-transform-types --enable-source-maps --import node-ts-resolver/transform main.ts
```
**Note**: When using the transform mode, it's recommended to use the `--enable-source-maps` flag to preserve original source maps for better debugging.

### Node.js Version Considerations

Type stripping is enabled by default since **Node 23.6.0+**, so you can omit the `--experimental-strip-types` flag:

```bash
node --import node-ts-resolver/strip main.ts
```

### Alternative Usage

Instead of the import flag, you can also import the resolver in your entry file:

```typescript
// entry.ts
import "node-ts-resolver/strip"; // or "node-ts-resolver/transform"
import("./main.js");
```

Then run with just the required handling flag:

```bash
node --experimental-strip-types entry.ts
```

### `.js` takes precedence

Note that native resolution always takes precedence over TypeScript resolution. If a `.js` file exists, it will be resolved instead of a `.ts` file with the same name. This is consistent with how TypeScript resolves modules, ensuring that existing JavaScript files are prioritized.

### Monorepo Support

**node-ts-resolver** enables resolving `.ts` files in `node_modules`, making monorepo support possible.

This is achieved by using [amaro](https://github.com/nodejs/amaro) under the hood, which is Node's internal TypeScript loader, and is responsible for type stripping and transforming. This allows the resolver to handle TypeScript files anywhere in the dependency tree, not just in your local project.

#### Example

```typescript
// packages/my-shared-package/src/utils.ts
export function sharedUtil(): string {
  return "Hello from my-shared-package";
}
```

```typescript
// packages/app/src/main.ts
import { sharedUtil } from "my-shared-package/src/utils.js"; // Note: .js extension
console.log(sharedUtil());
```

With node-ts-resolver, this works seamlessly without needing to build the shared package first:

```bash
node --experimental-strip-types --import node-ts-resolver/strip packages/app/src/main.ts
```

## Inspiration

This project started off as a fork from [node-resolve-ts](https://github.com/franklin-ross/node-resolve-ts) by Franklin Ross.

It was created to address the limitations of that package, particularly around monorepo support.
Additionally, it should be a little bit more performant, as it runs builtin resolution mechanism first, and only falls back to TypeScript resolution if it fails.
