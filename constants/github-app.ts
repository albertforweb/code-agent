export const PR_TITLE = 'Add CodeAgent GitHub Action Workflow'

export const GITHUB_ACTION_SETUP_DOCS_URL =
  'https://github.com/albertforweb/code-agent-action/blob/main/docs/setup.md'

export const WORKFLOW_CONTENT = `name: CodeAgent Assistant

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  code-agent:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@code-agent')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@code-agent')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@code-agent')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@code-agent') || contains(github.event.issue.title, '@code-agent')))
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
      actions: read # Required for CodeAgent to read CI results on PRs
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run CodeAgent Assistant
        id: code-agent
        uses: albertforweb/code-agent-action@v1
        with:
          code_agent_api_key: \${{ secrets.CODE_AGENT_API_KEY }}

          # This is an optional setting that allows CodeAgent to read CI results on PRs
          additional_permissions: |
            actions: read

          # Optional: Give a custom prompt to CodeAgent. If this is not specified, CodeAgent will perform the instructions specified in the comment that tagged it.
          # prompt: 'Update the pull request description to include a summary of changes.'

          # Optional: Add code_agent_args to customize behavior and configuration
          # See https://github.com/albertforweb/code-agent-action/blob/main/docs/usage.md
          # or https://github.com/albertforweb/code-agent for available options
          # code_agent_args: '--allowed-tools Bash(gh pr:*)'

`

export const PR_BODY = `## Installing CodeAgent GitHub Action

This PR adds a third-party CodeAgent GitHub Actions workflow to this repository.

### What is this integration?

The CodeAgent GitHub Action is a hosted workflow that can help with:
- Bug fixes and improvements  
- Documentation updates
- Implementing new features
- Code reviews and suggestions
- Writing tests
- And more!

### How it works

Once this PR is merged, we'll be able to interact with CodeAgent by mentioning @code-agent in a pull request or issue comment.
Once the workflow is triggered, CodeAgent will analyze the comment and surrounding context, and execute on the request in a GitHub action.

### Important Notes

- **This workflow won't take effect until this PR is merged**
- **@code-agent mentions won't work until after the merge is complete**
- The workflow runs automatically whenever CodeAgent is mentioned in PR or issue comments
- CodeAgent gets access to the entire PR or issue context including files, diffs, and previous comments

### Security

- Our CodeAgent API key is securely stored as a GitHub Actions secret
- Only users with write access to the repository can trigger the workflow
- All CodeAgent runs are stored in the GitHub Actions run history
- CodeAgent's default tools are limited to reading/writing files and interacting with our repo by creating comments, branches, and commits.
- We can add more allowed tools by adding them to the workflow file like:

\`\`\`
allowed_tools: Bash(npm install),Bash(npm run build),Bash(npm run lint),Bash(npm run test)
\`\`\`

There's more information in the [CodeAgent action repo](https://github.com/albertforweb/code-agent-action).

After merging this PR, let's try mentioning @code-agent in a comment on any PR to get started!`

export const CODE_REVIEW_PLUGIN_WORKFLOW_CONTENT = `name: CodeAgent Assistant Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
    # Optional: Only run on specific file changes
    # paths:
    #   - "src/**/*.ts"
    #   - "src/**/*.tsx"
    #   - "src/**/*.js"
    #   - "src/**/*.jsx"

jobs:
  code-agent-review:
    # Optional: Filter by PR author
    # if: |
    #   github.event.pull_request.user.login == 'external-contributor' ||
    #   github.event.pull_request.user.login == 'new-developer' ||
    #   github.event.pull_request.author_association == 'FIRST_TIME_CONTRIBUTOR'

    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run CodeAgent Assistant Review
        id: code-agent-review
        uses: albertforweb/code-agent-action@v1
        with:
          code_agent_api_key: \${{ secrets.CODE_AGENT_API_KEY }}
          plugin_marketplaces: 'https://github.com/albertforweb/code-agent.git'
          plugins: 'code-review@code-agent-plugins'
          prompt: '/code-review:code-review \${{ github.repository }}/pull/\${{ github.event.pull_request.number }}'
          # See https://github.com/albertforweb/code-agent-action/blob/main/docs/usage.md
          # or https://github.com/albertforweb/code-agent for available options

`
