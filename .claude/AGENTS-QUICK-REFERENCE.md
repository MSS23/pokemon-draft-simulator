# Custom Agents - Quick Reference Card

## 🚀 Broad-Scope Agents (General Development)

### 🎨 Frontend Specialist
**Focus:** React, Next.js, UI/UX, components, Tailwind
**Use for:** Building UI, implementing features, responsive design
**Files:** `src/app/`, `src/components/`, `src/hooks/`

### ⚙️ Backend Specialist
**Focus:** API routes, business logic, database operations, auth
**Use for:** Server-side features, API endpoints, data validation
**Files:** `src/app/api/`, `src/lib/*-service.ts`

### 🐛 Bug Fixer
**Focus:** Debugging, root cause analysis, error reproduction
**Use for:** Investigating bugs, systematic debugging, fixes
**Files:** All files (debugging context)

### ✨ Code Quality
**Focus:** Clean code, SOLID principles, refactoring, best practices
**Use for:** Code reviews, refactoring, improving maintainability
**Files:** All files (quality review)

### 📊 Product Strategy
**Focus:** Roadmap, features, growth, metrics, business decisions
**Use for:** Feature prioritization, UX strategy, product planning
**Files:** Documentation, strategy planning

---

## 🎯 Domain-Specific Agents

### 🎮 Format Validator
**Focus:** Pokemon legality, VGC rules, format validation
**Use for:** "Is [Pokemon] legal?", cost calculations, format tests
**Files:** `src/lib/formats.ts`, `src/domain/rules/`

### 🔄 Draft Debugger
**Focus:** State management, real-time sync, turn order
**Use for:** Draft state bugs, Zustand issues, real-time problems
**Files:** `src/stores/draftStore.ts`, `src/lib/realtime-manager.ts`

### ✅ Test Writer
**Focus:** Vitest tests, React Testing Library, coverage
**Use for:** Writing unit/integration tests, test fixtures
**Files:** `tests/**/*.test.ts`, `tests/utils/`

### 🔧 Type Fixer
**Focus:** TypeScript errors, type inference, generics
**Use for:** Build errors, type safety, Supabase types
**Files:** `src/types/`, all `.ts/.tsx` files

### ⚡ Performance Optimizer
**Focus:** React performance, memoization, bundle size
**Use for:** Re-render issues, slow components, large bundles
**Files:** `src/lib/store-optimization.ts`, components

### 🗄️ Database Helper
**Focus:** Supabase, RLS policies, PostgreSQL, migrations
**Use for:** Database queries, RLS debugging, schema design
**Files:** `supabase-schema.sql`, `src/lib/supabase.ts`

---

## Quick Usage

### In Conversation
```
@frontend-specialist Build a Pokemon selection modal
@backend-specialist Create API endpoint for picks
@bug-fixer Debug turn order skipping players
@code-quality Review DraftService for issues
@product-strategy Should we build mobile app?
@format-validator Is Koraidon legal in VGC Reg H?
@draft-debugger Fix real-time sync issue
@test-writer Write tests for budget validation
@type-fixer Fix TypeScript errors
@performance-optimizer Optimize PokemonGrid
@database-helper Debug RLS policy
```

### With Task Tool
```typescript
Task({
  subagent_type: "general-purpose",
  description: "Build feature",
  prompt: "Use frontend-specialist to build a timer component"
})
```

---

## Decision Tree

```
START: What do you need help with?
│
├─ Building UI/frontend features?
│  └─> Use: frontend-specialist
│
├─ Building API/backend features?
│  └─> Use: backend-specialist
│
├─ Have a bug to fix?
│  └─> Use: bug-fixer
│
├─ Code review or refactoring?
│  └─> Use: code-quality
│
├─ Product/business decisions?
│  └─> Use: product-strategy
│
├─ Pokemon format legality?
│  └─> Use: format-validator
│
├─ Draft state/real-time issues?
│  └─> Use: draft-debugger
│
├─ Need to write tests?
│  └─> Use: test-writer
│
├─ TypeScript compilation errors?
│  └─> Use: type-fixer
│
├─ Performance problems?
│  └─> Use: performance-optimizer
│
└─ Database/RLS issues?
   └─> Use: database-helper
```

---

## Agent Combinations

Some tasks benefit from multiple agents:

**Building a New Feature (Full Stack)**
1. `@product-strategy` - Evaluate and prioritize
2. `@frontend-specialist` - Build UI components
3. `@backend-specialist` - Create API endpoints
4. `@test-writer` - Add test coverage
5. `@code-quality` - Review and refactor

**Fixing a Complex Bug**
1. `@bug-fixer` - Reproduce and identify root cause
2. `@draft-debugger` or domain agent - Deep dive
3. `@type-fixer` - Fix any type errors
4. `@test-writer` - Add regression test

**Optimizing Application**
1. `@performance-optimizer` - Identify bottlenecks
2. `@frontend-specialist` - Optimize components
3. `@database-helper` - Optimize queries
4. `@code-quality` - Refactor for maintainability

**Planning & Implementation**
1. `@product-strategy` - Plan feature roadmap
2. `@frontend-specialist` - Design UI/UX
3. `@backend-specialist` - Design data model
4. `@test-writer` - Plan test strategy

---

## Categories

### Development
- Frontend Specialist
- Backend Specialist
- Type Fixer

### Debugging
- Bug Fixer
- Draft Debugger

### Quality Assurance
- Code Quality
- Test Writer

### Optimization
- Performance Optimizer

### Infrastructure
- Database Helper

### Business
- Product Strategy

### Domain-Specific
- Format Validator

---

## Quick Tips

✅ **Use broad agents for:**
- General feature development
- Full-stack work
- Strategic decisions
- Quality improvements

✅ **Use domain agents for:**
- Specific technical issues
- Deep expertise needed
- Project-specific knowledge

💡 **Combine agents when:**
- Building complete features
- Solving complex problems
- Need multiple perspectives

📝 **Be specific:**
- Include file names
- Provide error messages
- Describe expected behavior
- Share relevant context
