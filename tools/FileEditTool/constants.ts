// In its own file to avoid circular dependencies
export const FILE_EDIT_TOOL_NAME = 'Edit'

// Permission pattern for granting session-level access to the project's .codeAgent/ folder
export const CODE_AGENT_FOLDER_PERMISSION_PATTERN = '/.codeAgent/**'

// Permission pattern for granting session-level access to the global ~/.codeAgent/ folder
export const GLOBAL_CODE_AGENT_FOLDER_PERMISSION_PATTERN = '~/.codeAgent/**'

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  'File has been unexpectedly modified. Read it again before attempting to write it.'
