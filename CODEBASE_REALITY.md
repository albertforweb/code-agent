# 📋 Important: Understanding This Codebase

## What You're Working With

This is the **Claude Code CLI source code that was leaked from npm**. It has some important characteristics:

### 🎯 Original Design
- **Runtime**: Bun (not Node.js)
- **Build Tool**: Bun's bundler
- **Target**: Internal Anthropic tool
- **Features**: 40+ tools, assistant AI system, pet system, etc.

### 🚨 Key Challenge

The code has **2,770+ TypeScript errors** because:

1. ❌ **Bun-specific imports** - `bun:bundle`, `Bun.*` APIs
2. ❌ **Missing internal modules** - Internal Anthropic files that don't exist in the repo
3. ❌ **Internal dependencies** - References to `@anthropic-ai/sdk` internals
4. ❌ **Runtime mismatches** - Code expects Bun but we're using Node.js TypeScript

### 📦 What's In The Repo

✅ **1,900+ TypeScript files** (full source code)
✅ **512,000+ lines of code** (entire codebase)
❌ **Missing internal types/modules** (internal to Anthropic)
❌ **Bun runtime specific** (not Node.js compatible)

## The Reality

This codebase **cannot compile to working Node.js JavaScript** because:

1. It uses Bun-specific APIs and modules
2. Many internal Anthropic modules are missing
3. The SDK it depends on has internal exports that changed
4. It has compile-time feature flags (Bun-specific)

## What You CAN Do

### Option 1: Build with TypeScript Anyway (Partial Success)
```bash
tsc --noEmitOnError false  # Compile despite errors
```
This will create JavaScript files even with type errors, but they likely won't run correctly.

### Option 2: Use Bun Runtime (Proper Solution)
Install Bun from https://bun.sh and use Bun to run/build:

```bash
bun build ./main.tsx --outdir ./dist
bun install
bun run build
```

Bun would understand all the Bun-specific imports and APIs.

### Option 3: Study The Source (Best for Analysis)
- Read the TypeScript files directly
- Understand the architecture
- Learn from the implementation
- This is what most people do with this leaked source

## Recommended Path

If your goal is to **run** the code:
- **Use Bun** - This is what it was designed for

If your goal is to **understand** the code:
- **Read the TypeScript** - You have the full source!
- **Don't try to compile** - Focus on studying the code

If you want to **port it to Node.js**:
- **Massive undertaking** - Would require:
  - Rewriting Bun-specific code
  - Implementing missing modules
  - Fixing SDK incompatibilities
  - Weeks/months of work

## Current Status

✅ **All npm dependencies installed**
✅ **TypeScript compiler set up**
⚠️ **2,770 type errors** (expected - Bun code, not Node.js)
❌ **Won't compile cleanly** without fixing Bun-specific code
❌ **Won't run** as-is in Node.js

## Next Steps - Choose Your Path

### Path A: Use Bun (Recommended)
```bash
# Install Bun: https://bun.sh
bun install
bun run build
bun dist/main.js
```

### Path B: Partial Compilation (Limited Success)
```bash
npm run build  # Will compile despite errors
ls dist/       # Will have .js files
node dist/main.js  # Probably won't work properly
```

### Path C: Source Code Analysis (Most Value)
```bash
# Just read the TypeScript files
# Learn the architecture
# Understand Claude Code internals
# No build needed!
```

---

## Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Source Code | ✅ Complete | 1,900+ files, 512,000+ lines |
| Dependencies | ✅ Installed | 136 npm packages |
| TypeScript Config | ✅ Configured | Set for permissive compilation |
| Compilation | ⚠️ Partial | 2,770 errors due to Bun code |
| Runtime | ❌ Not Ready | Needs Bun or significant refactoring |

---

## The Bottom Line

You have the **complete leaked source code** for Claude Code. It's a Bun project, so trying to build it with Node.js TypeScript is like trying to run a macOS app on Windows - the fundamentals don't match.

**Recommended approach**: Install Bun and build properly, or just read the TypeScript code for learning purposes.

See the Bun documentation to install and get started: https://bun.sh
