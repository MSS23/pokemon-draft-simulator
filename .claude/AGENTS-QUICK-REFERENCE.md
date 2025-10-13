# Custom Agents - Quick Reference Card

## 🎯 Format Validator
**Focus:** Pokemon legality, VGC rules, format validation
**Use for:** "Is [Pokemon] legal?", cost calculations, format tests
**Files:** `src/lib/formats.ts`, `src/domain/rules/format-rules-engine.ts`

## 🐛 Draft Debugger
**Focus:** State management, real-time sync, turn order
**Use for:** Draft state bugs, Zustand issues, real-time problems
**Files:** `src/stores/draftStore.ts`, `src/lib/realtime-manager.ts`

## ✅ Test Writer
**Focus:** Vitest tests, React Testing Library, coverage
**Use for:** Writing unit/integration tests, test fixtures
**Files:** `tests/**/*.test.ts`, `tests/utils/test-helpers.ts`

## 🔧 Type Fixer
**Focus:** TypeScript errors, type inference, generics
**Use for:** Build errors, type safety, Supabase types
**Files:** `src/types/index.ts`, `tsconfig.json`

## ⚡ Performance Optimizer
**Focus:** React performance, memoization, bundle size
**Use for:** Re-render issues, slow components, large bundles
**Files:** `src/lib/store-optimization.ts`, React components

## 🗄️ Database Helper
**Focus:** Supabase, RLS policies, PostgreSQL, migrations
**Use for:** Database queries, RLS issues, real-time subs
**Files:** `supabase-schema.sql`, `src/lib/supabase.ts`

---

## Quick Usage

### In Conversation
```
@format-validator Is Koraidon legal in VGC Reg H?
@draft-debugger Fix turn order skipping players
@test-writer Write tests for budget validation
@type-fixer Fix TypeScript errors in draft-service.ts
@performance-optimizer Optimize PokemonGrid rendering
@database-helper Debug RLS policy blocking reads
```

### With Task Tool
```typescript
Task({
  subagent_type: "general-purpose",
  description: "Validate Pokemon legality",
  prompt: "Use format-validator agent to check if Pokemon #1007 is legal in VGC Reg H"
})
```

---

## Decision Tree

```
START: What's your issue?
│
├─ Pokemon not allowed in draft?
│  └─> Use: format-validator
│
├─ Draft state incorrect or real-time not working?
│  └─> Use: draft-debugger
│
├─ Need to write or improve tests?
│  └─> Use: test-writer
│
├─ TypeScript compilation errors?
│  └─> Use: type-fixer
│
├─ App slow, large bundle, or excessive re-renders?
│  └─> Use: performance-optimizer
│
└─ Database queries, RLS, or migrations?
   └─> Use: database-helper
```

---

## Agent Combinations

Some tasks benefit from multiple agents:

**Fixing a bug with tests:**
1. `@draft-debugger` - Find root cause
2. `@type-fixer` - Fix type errors
3. `@test-writer` - Add regression test

**Adding new feature:**
1. `@database-helper` - Design schema
2. `@type-fixer` - Create types
3. `@performance-optimizer` - Optimize rendering
4. `@test-writer` - Add test coverage

**Performance issue:**
1. `@performance-optimizer` - Identify bottleneck
2. `@draft-debugger` - Check state subscriptions
3. `@test-writer` - Add performance tests
