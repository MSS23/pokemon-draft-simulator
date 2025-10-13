# Pokemon Draft Simulator - Custom Agents

This directory contains specialized AI agents for different aspects of the Pokemon Draft Simulator project. Each agent is an expert in a specific domain and can be invoked using the Task tool or slash commands.

## Available Agents

### 1. Format Validator (`format-validator.md`)
**Expertise:** Pokemon format validation, legality checks, VGC rules
**Use When:**
- Validating Pokemon legality in formats
- Debugging format rules engine
- Writing format-specific tests
- Checking cost calculations

**Example Usage:**
```
@format-validator Is Koraidon legal in VGC Reg H?
@format-validator Debug why Tinkaton is allowed but Iron Valiant isn't
@format-validator Write tests for paradox Pokemon detection
```

---

### 2. Draft Debugger (`draft-debugger.md`)
**Expertise:** State management, real-time sync, turn order, Zustand, Supabase
**Use When:**
- Debugging draft state issues
- Fixing real-time synchronization problems
- Troubleshooting turn order calculations
- Investigating optimistic update failures

**Example Usage:**
```
@draft-debugger Turn order is skipping players in snake draft
@draft-debugger Picks not appearing in real-time for other users
@draft-debugger Current team selector returning null
```

---

### 3. Test Writer (`test-writer.md`)
**Expertise:** Vitest, React Testing Library, test fixtures, coverage
**Use When:**
- Writing comprehensive unit tests
- Creating integration tests for user flows
- Building test fixtures and helpers
- Improving test coverage

**Example Usage:**
```
@test-writer Write tests for snake draft turn calculation
@test-writer Create integration test for full draft flow
@test-writer Add tests for budget validation edge cases
```

---

### 4. Type Fixer (`type-fixer.md`)
**Expertise:** TypeScript errors, type inference, Supabase types, generics
**Use When:**
- Fixing TypeScript compilation errors
- Resolving Supabase never types
- Improving type safety
- Handling generic type issues

**Example Usage:**
```
@type-fixer Fix implicit any error in WishlistManager line 97
@type-fixer Resolve Supabase never type in draft-service
@type-fixer Replace all any types with proper types
```

---

### 5. Performance Optimizer (`performance-optimizer.md`)
**Expertise:** React performance, memoization, virtualization, bundle size
**Use When:**
- Optimizing component rendering
- Reducing bundle size
- Fixing excessive re-renders
- Implementing virtualization

**Example Usage:**
```
@performance-optimizer Optimize PokemonGrid for 1000+ items
@performance-optimizer Reduce bundle size of draft page
@performance-optimizer Fix excessive re-renders in WishlistManager
```

---

### 6. Database Helper (`database-helper.md`)
**Expertise:** Supabase, PostgreSQL, RLS policies, migrations, query optimization
**Use When:**
- Debugging RLS policy issues
- Writing database migrations
- Optimizing queries
- Fixing real-time subscription problems

**Example Usage:**
```
@database-helper Why can't users see their draft picks?
@database-helper Create RLS policy for team updates
@database-helper Optimize query for loading draft data
```

---

## How to Use Agents

### Method 1: Task Tool (Programmatic)
Use the Task tool in the Claude Code interface:
```typescript
// In your task
Task({
  agent: "format-validator",
  task: "Validate if Pokemon #1007 is legal in VGC Reg H"
})
```

### Method 2: @ Mentions (Conversational)
Mention agents in conversation:
```
@format-validator Is Tinkaton legal in the current format?
@type-fixer Help me resolve the TypeScript errors in draft-service.ts
```

### Method 3: Slash Commands
If integrated with slash commands, use:
```
/format-validator check Pokemon #1007
/draft-debugger fix turn order issue
```

---

## Agent Best Practices

### When to Use Agents
✅ **Use agents when:**
- Task requires deep domain expertise
- Need systematic debugging approach
- Want consistent solutions following patterns
- Building comprehensive tests or documentation

❌ **Don't use agents for:**
- Simple file edits
- One-off questions
- Tasks spanning multiple domains (use general-purpose agent)

### Choosing the Right Agent
1. **Identify the domain** - Format rules? Database? Performance?
2. **Check agent expertise** - Read the agent's description
3. **Provide context** - Include file names, error messages, expected behavior
4. **Be specific** - Clear questions get better answers

### Agent Response Formats
Each agent follows a structured response format for consistency:
- **Issue/Query**: What you asked
- **Analysis**: What the agent found
- **Solution**: How to fix it
- **Code**: Implementation details
- **Testing**: How to verify

---

## Creating New Agents

To add a new specialized agent:

1. Create `[agent-name].md` in this directory
2. Follow this structure:
   ```markdown
   # Agent Name

   You are a [specialty] specialist.

   ## Your Expertise
   - Bullet points of knowledge areas

   ## Key Files to Reference
   - List relevant files

   ## Your Tasks
   - What the agent does

   ## [Relevant Sections]
   - Patterns, examples, workflows

   ## Example Queries
   - Sample questions/tasks
   ```
3. Update this README with agent info
4. Test with various queries

---

## Contributing

When updating agents:
- Keep expertise focused and specific
- Add concrete code examples
- Update example queries
- Document common pitfalls
- Link to relevant project files

---

## Support

For issues with agents:
1. Check agent's "Example Queries" section
2. Verify you're using the right agent for your task
3. Provide complete context (files, errors, logs)
4. Try rephrasing your question if unclear

Happy coding! 🚀
