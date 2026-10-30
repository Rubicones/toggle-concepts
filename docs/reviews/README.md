# Work Reviews & Migration Handoffs

All task reviews completed on feature branches must be saved in this directory as:

```text
docs/reviews/<YYYY-MM-DD>-<task-slug>.md
```

Every review file **must** begin with **`## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)`** so the repository owner immediately sees whether any SQL migration in `supabase/migrations/` needs to be applied to Supabase when merging the branch.

See [`CLAUDE.md`](../../CLAUDE.md) for the required template and checklist.
