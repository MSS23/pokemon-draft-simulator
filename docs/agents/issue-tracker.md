# Issue tracker

Issues live in this repository's GitHub Issues. Use the `gh` CLI:

```bash
gh issue list --label ready-for-agent
gh issue view <number>
gh issue create --title "..." --body "..." --label needs-triage
gh issue comment <number> --body "..."
```

Reference issues in commits and PRs as `#<number>`. Do not close an issue
from an agent unless the work is merged or the user says so.
