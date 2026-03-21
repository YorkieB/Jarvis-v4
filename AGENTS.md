# Copilot Agent Guidelines

This document guides GitHub Copilot's **agent mode** (autonomous actions) to behave safely and effectively in this project.

## Environment Setup
- **Installation**: The agent should ensure all dependencies are installed (run `npm install` in the project root, and in `frontend/` if that has its own package.json).
- **Environment Vars**: The agent must load environment variables (e.g., via `dotenv`) before running tasks that require them (like making search queries using the API key).
- **Dev vs Prod Mode**: Recognize `NODE_ENV`; avoid doing things in production environment that are unsafe (the agent typically might run in a controlled dev environment anyway).

## Task Execution
- **Scoped Changes**: The agent should only make changes related to its given objective or query. It should not 'wander' into unrelated code.
- **Testing After Changes**: After the agent modifies code, it should run `npm test` to ensure nothing is broken. If tests exist, they must pass.
- **Incremental Commits**: For multi-step tasks, the agent should commit after each significant change with a clear message, rather than one huge commit. This allows easier rollback if needed.
- **Pull Requests**: If operating in a repository context, the agent should open a PR for review rather than pushing directly to main, especially for large changes.

## Safety & Confirmation
- **No Destructive Ops**: The agent must not perform destructive operations (deleting files, wiping data) without clear instruction and ideally confirmation:
  - If a task says "remove X feature," it can proceed to remove related code, but it should ensure version control can recover it if needed.
  - For file deletions or large refactors, it might be wise to mark for human review.
- **When Unsure, Comment**: If the agent is uncertain about a code area or a decision:
  - It should insert a `// TODO:` comment or similar in the code, highlighting the uncertainty or need for review.
  - Example: `// TODO: Confirm this condition, not sure if it covers all cases`.
- **No Secrets Exposure**: The agent should never output or commit secrets. If it somehow has access to the API key or user data, it should keep them secret (this aligns with our config practice).

## Communication & Documentation
- Document any changes it makes in commit messages and PR descriptions thoroughly.
- Use the British English style for any written communication (commit messages, comments).
- If the agent introduces a new dependency or significant code, it should update the relevant documentation files (README, instructions) accordingly.

## Uncertainty and Risk Mitigation
- If a requested change might impact multiple parts of the system (e.g., upgrading a library, renaming a widely-used function), the agent should do a thorough search of the code to make all necessary adjustments and test after.
- The agent should avoid making broad code style changes (like reformatting the whole project) unless specifically instructed, as that can introduce noise and merge conflicts.
- In case of ambiguous requirements, the agent should make a conservative assumption or leave a note for a human to clarify later, rather than implement something potentially wrong.

By following these guidelines, Copilot's agent will act as a careful collaborator that respects project conventions and safety. It will enhance productivity by handling routine tasks, while leaving anything uncertain or risky to human oversight.
