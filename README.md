# Node Resolve TypeScript

## Overview

Actually use `node --experimental-strip-types` to run regular Typescript code by allowing Node to resolve `.ts` files when it finds a `.js` import extension.

ESM (and therefore Node running ESM) needs the full file extension to resolve relative imports to source files. Since one of Typescript's fundamental philosophies is to [never transform an existing valid JS construct into something else](https://github.com/microsoft/TypeScript/issues/40878#issuecomment-702353715), it also needs the full extension _of the output file_ when using the strict module resolution algorithm, meaning Typescript expects `.js` extensions in imports even when referencing a relative `.ts` source file. Since Node's type striping does nothing to help Node resolve a `.ts` file for a `.js` import specifier, Node will error as soon as it encounters a Typescript ESM import of another Typescript file.

### Example

```bash
cat << EOF > add.ts
export function add(a: number, b: number): number {
  return a + b;
}
EOF

cat << EOF > main.ts
import { add } from './add.js';

console.log(add(2,3));
EOF

node --experimental-strip-types main.ts

# Results in:

# node:internal/modules/esm/resolve:257
#    throw new ERR_MODULE_NOT_FOUND(
#          ^
#Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/example/add.js' imported from /home/example/main.ts

node --experimental-strip-types --import node-resolve-ts/register main.ts

# Results in: 5
```

## Installation

To install this module locally in your project:

```bash
npm install node-resolve-ts
```

Or use your package manager of choice.

## Usage

Import the registration module before your Typescript code loads. Node will now prefer to load `.ts` files if they exist but fall back to the `.js` otherwise.

```bash
node --experimental-strip-types --import node-resolve-ts/register main.ts
```

If you would rather load the `.js` file preferentially over the `.ts` when both exist, use this:

```bash
node --experimental-strip-types --import node-resolve-ts/register-prefer-js main.ts
```

### Alternative Usage

If you can't use the above method, an alternative is to import `node-resolve-ts/register` in your entry file and then dynamically import the rest of your code. Since the static import runs first, the resolve hook will be installed and ready by the time the dynamic import run.

```typescript
// entry.ts
import "node-resolve-ts/register";
import("./main.js");

// main.ts
import { here } from './a-typescript-file.js';
the.rest(of: your): code {
  here();
}
```

```bash
# Then run your entry.ts with regular type stripping
node --experimental-strip-types entry.ts
```

## Monorepo Support / Resolving TypeScript in `node_modules`

Node's built-in `--experimental-strip-types` flag has a limitation: it cannot strip types from files under `node_modules`. This can be problematic in monorepos where packages import TypeScript files from other packages in the workspace.

To work around this limitation, you can manually import [amaro](https://github.com/nodejs/amaro), Node's internal TypeScript loader, enabling support for type-stripping of files inside `node_modules`:

```bash
# Install amaro in your project
npm install amaro

# Use both flags together - amaro handles the type stripping for all files
node --experimental-strip-types --import amaro/strip --import node-resolve-ts/register main.ts
```

This combination allows:
- `node-resolve-ts` to resolve `.js` imports to `.ts` files anywhere (including in `node_modules`)
- `amaro` to strip types from TypeScript files, even those in `node_modules`
- Full monorepo support where packages can directly import TypeScript source from other packages

### Example Monorepo Setup

```typescript
// packages/shared/src/utils.ts
export function sharedUtil(): string {
  return "Hello from shared package";
}

// packages/app/src/main.ts
import { sharedUtil } from "shared/src/utils.js"; // Note: .js extension
console.log(sharedUtil());
```

With the combined approach, this will work seamlessly without needing to build the shared package first.
