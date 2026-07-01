---
name: code-agent-project-policy
description: Project-local policy for work in /Users/hongwel2/mygit/code-agent. Use these instructions before selecting skills or workflows for this repository.
---

# CodeAgent Project Policy

For all work in this repository:

- Do not auto-load, auto-select, invoke, or follow any skill whose files live under `/Users/hongwel2/.codex/skills/ai-agent-skills`.
- Treat every skill under that tree as unavailable for this project, even when its name or description appears to match the task.
- This includes `code-writer` and all other common, Catalyst Center, PNC, writer, planner, review, Jira, dependency, and documentation skills from that tree.
- Do not read `SKILL.md`, run scripts, load references, or reuse templates from that tree for this project.
- Use direct repository inspection, normal shell commands, local code edits, and project docs instead.
- If a matching skill from that tree would normally be auto-selected, ignore it for this repository.

The user may override this policy only with an explicit instruction in the active conversation.
