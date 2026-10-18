# Third-party sources

The application was implemented for this repository. QloApps and Chatwoot were consulted for product/domain behavior; their PHP, Rails and Vue implementation code has not been incorporated, bundled, or installed in MaokiHouse.

Files intentionally included from upstream:

| Files | Source | License |
| --- | --- | --- |
| `.agents/skills/supabase/`, `.agents/skills/supabase-postgres-best-practices/` | [supabase/agent-skills](https://github.com/supabase/agent-skills); install metadata in `skills-lock.json` | [MIT notice](licenses/supabase-agent-skills-MIT.txt) |
| `supabase/registry/supabase-client-react-router.json`, `src/lib/supabase/router-client.ts`, `src/lib/supabase/server.ts` | [Supabase UI registry, pinned snapshot](https://github.com/supabase/supabase/tree/7425d4930528931400fb3e656e860b1094cb224e/apps/ui-library) | [Repository Apache-2.0 license](licenses/supabase-Apache-2.0.txt) |

`docs/apple-design-skill.md` and `docs/opensource-reference-provided.md` retain the documents supplied by the user as reference material. Their contents do not replace the user's task instructions. The HIG reference bundle mentioned by the supplied design skill was not attached.

Existing MaokiHouse photos are reused from the repository's existing assets. npm dependencies retain their individual notices/licenses in their packages and are identified in the lockfile.
