# Codebase Improvement Checklist

## Completed ✅

- [x] Created comprehensive codebase analysis (CODEBASE_ANALYSIS.md)
- [x] Removed unused imports from admin page
- [x] Fixed unused import warning in draft results page
- [x] Fixed string escaping in create-draft page

## In Progress 🔄

### Phase 1: Quick Wins

- [ ] Fix remaining string escaping issues
- [ ] Remove all unused variables
- [ ] Add TypeScript strict mode incrementally
- [ ] Fix React hook dependencies

### Phase 2: Type Safety

- [ ] Create Supabase response types
- [ ] Replace `any` in draft-service.ts
- [ ] Replace `any` in supabase.ts
- [ ] Add strict null checks

### Phase 3: Error Handling

- [ ] Create custom error classes
- [ ] Add error boundaries to main sections
- [ ] Implement error logging
- [ ] Improve user error messages

### Phase 4: Performance

- [ ] Add React.memo to PokemonCard
- [ ] Implement virtual scrolling
- [ ] Optimize draft state updates
- [ ] Add performance monitoring

### Phase 5: Testing

- [ ] Set up Vitest
- [ ] Write service tests
- [ ] Write component tests
- [ ] Add E2E tests

## Commands

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint --fix

# Build and check
npm run build

# Type check only
npx tsc --noEmit
```

## Files to Fix

### High Priority
1. `lib/draft-service.ts` - Type safety, split file
2. `lib/supabase.ts` - Type safety
3. `hooks/useSupabase.ts` - Type safety
4. `app/join-draft/page.tsx` - Hook dependencies
5. Error boundaries - Add to app layout

### Medium Priority
1. All components with unused vars
2. String escaping in all files
3. Performance optimization in PokemonGrid
4. Split large service files

### Low Priority
1. Code formatting
2. Comment improvements
3. Documentation updates
