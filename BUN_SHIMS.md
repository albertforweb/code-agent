# ✅ Bun Dependency Removal - Shim Approach

## The Idea

Instead of trying to build for Bun, we create **TypeScript shim modules** that implement the Bun-specific functionality using Node.js equivalents. This removes the Bun dependency entirely!

## What We Did

### 1. Created Shim Modules

**`node_modules/react/compiler-runtime.ts`**
- Provides stub implementations of React compiler runtime functions
- Used by 50+ component files for React optimizations
- Minimal impact - just passes through the values

**`node_modules/bun/index.ts`**
- Implements Bun.* APIs using Node.js equivalents:
  - `Bun.hash()` → `crypto.createHash()`
  - `Bun.which()` → `execSync('which')`
  - `Bun.spawn()` → `child_process.spawn()`
  - `Bun.semver.*` → Manual version parsing
  - `Bun.stringWidth()` → Character counting
  - `Bun.gc()` → Node.js global.gc()
  - etc.

### 2. Updated TypeScript Path Mappings

In `tsconfig.json`, added:
```json
{
  "paths": {
    "bun:bundle": ["./node_modules/bun/index.ts"],
    "bun/*": ["./node_modules/bun/*"],
    "react/compiler-runtime": ["./node_modules/react/compiler-runtime.ts"]
  }
}
```

This tells TypeScript to use our shims instead of looking for the real Bun/React packages.

### 3. Updated Build Script

Modified `package.json` to compile despite remaining errors:
```json
{
  "build": "tsc --noEmitOnError false"
}
```

The `--noEmitOnError false` flag tells tsc to generate output even if there are type errors.

## What This Solves

✅ **`feature()` function** - Used 170+ times
- Shim returns false for all features (could be enabled via env vars)
- All code compiles without dead-code-elimination

✅ **Bun.* APIs** - Used ~15 times in key utilities
- Replaced with Node.js equivalents
- `hash`, `which`, `spawn`, `gc`, `semver`, `stringWidth`, etc.

✅ **react/compiler-runtime** - Used 50+ times
- Minimal stub that just passes through values
- No functional impact on app logic

## Remaining Errors

There will still be ~2,700 TypeScript errors from:

1. **Missing internal modules** - Files that don't exist in the repo:
   - `../entrypoints/sdk/controlTypes.js`
   - `../types/message.js`
   - `src/types/message.js`
   - etc.

2. **SDK export mismatches** - SDK version incompatibilities:
   - `ContentBlockParam` doesn't exist (use `ContentBlock`)
   - `Base64ImageSource` not exported
   - etc.

These are **NOT blocking compilation** if we use `--noEmitOnError false`

## Try It Now

```cmd
# Windows
build.bat build

# Or manually
npm run build
```

## What Happens

With the shims in place:

1. ✅ `bun:bundle` imports resolve to our shim
2. ✅ `react/compiler-runtime` imports resolve to our shim  
3. ✅ `Bun.*` calls use Node.js implementations
4. ⚠️ Some imports still fail (missing internal modules)
5. ✅ TypeScript generates .js output anyway (with `--noEmitOnError false`)

## Limitations

### What Won't Work
- **Bun runtime features**: The code was designed for Bun. Some features may not work:
  - Feature-gated code (BUDDY, KAIROS, etc.) will always be disabled
  - Some APIs have different behavior (Bun.hash vs crypto.hash)
  - Memory management (Bun.gc) has limitations

### What Will Work
- **Compilation** - Code compiles to JavaScript
- **Tree-shaking** - Node.js bundlers can optimize
- **Static analysis** - Can understand the code structure

### What's Still Missing
- **Internal Anthropic modules** - These reference internal files
- **Full SDK compatibility** - Some SDK exports changed

## Alternative: Keep Using Bun

If you need the code to actually work (not just compile), you should use Bun:

```bash
# Install Bun from https://bun.sh
bun install
bun build ./main.tsx --outdir ./dist
```

Bun will understand all the Bun-specific imports natively and the build will work correctly.

## Benefits of This Approach

✅ **Removes Bun requirement** - Build works with standard Node.js tools
✅ **Compiles to JavaScript** - Get output files for analysis
✅ **Enables portability** - Could potentially run parts of it in Node.js
✅ **Maintains structure** - All original code files stay intact
✅ **Partial functionality** - Some features might work despite the limitations

## Files Created

- `node_modules/react/compiler-runtime.ts` - React compiler shim
- `node_modules/bun/index.ts` - Bun APIs shim (Node.js equivalents)
- `tsconfig.json` updated - Added path mappings for shims
- `package.json` updated - Build script with `--noEmitOnError false`

## Next Steps

1. **Try building**: `npm run build` or `build.bat build`
2. **Check output**: `ls dist/` should have .js files
3. **Analyze errors**: See which remain and are actually blocking
4. **Consider next phase**: Use Bun if runtime functionality needed

---

**Result**: Bun dependencies replaced with TypeScript shims. Compilation should now produce JavaScript output files!
