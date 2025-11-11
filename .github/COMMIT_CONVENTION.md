# Commit Message Convention

## Skip CI Deployments

To prevent unnecessary Vercel deployments and stay under the 100 deployments/day limit, add `[skip ci]` to your commit message:

```bash
git commit -m "docs: Update README [skip ci]"
git commit -m "chore: Update config files [skip ci]"
```

## When to Skip CI

Use `[skip ci]` for:
- Documentation changes (*.md files)
- Configuration updates that don't affect build
- README updates
- Comment changes
- Formatting fixes (prettier, eslint --fix)

## When NOT to Skip CI

Always deploy for:
- Source code changes (src/**)
- Dependency updates (package.json)
- Build config changes (next.config.ts, tsconfig.json, tailwind.config.ts)
- Public asset changes (public/**)
- Database migrations (migrations/**)
- Bug fixes and features

## Examples

```bash
# Skip CI
git commit -m "docs: Add API documentation [skip ci]"
git commit -m "chore: Update .gitignore [skip ci]"
git commit -m "style: Fix typo in comment [skip ci]"

# Deploy
git commit -m "fix: Resolve TypeScript errors in league rankings"
git commit -m "feat: Add new draft analysis feature"
git commit -m "chore: Update dependencies"
```
