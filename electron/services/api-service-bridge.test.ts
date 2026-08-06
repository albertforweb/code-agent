import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiServiceBridge } from './api-service-bridge';

function projectRequest(prompt: string) {
  return {
    messages: [{ role: 'user' as const, content: prompt }],
    provider: 'codeagent' as const,
    model: 'test-model',
    enableTools: true,
    toolScope: {
      source: 'project-chat' as const,
      workspacePath: '/tmp/codeagent-project',
      projectId: 'project-1',
      projectName: 'Test project',
      projectChatKey: 'project-1:main',
      channel: 'main' as const,
    },
  };
}

function toolProvider() {
  return async () => [{
    name: 'fs.list',
    description: 'List entries in a workspace-relative directory',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    source: 'bridge',
    readOnly: true,
  }];
}

test('the model selects a filesystem tool and the answering model receives its real result', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  const executions: Array<{ name: string; args: Record<string, unknown> }> = [];
  const requestBodies: any[] = [];
  service.setToolProvider(toolProvider(), async (name, args) => {
    executions.push({ name, args });
    return {
      path: '.',
      exists: true,
      empty: false,
      entries: [
        { name: 'src', type: 'directory' },
        { name: 'package.json', type: 'file', size: 512 },
      ],
    };
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requestBodies.push(JSON.parse(String(init?.body)));
    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              id: 'call-list',
              type: 'function',
              function: { name: 'fs_list', arguments: '{"path":"."}' },
            }],
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (requestBodies.length === 2) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: 'The project contains `src/` and `package.json`.' } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'The project contains `src/` and `package.json`.' } }],
      usage: { prompt_tokens: 12, completion_tokens: 6 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat(projectRequest('请告诉我这个项目里目前有什么。'));

    assert.deepEqual(executions, [{ name: 'fs.list', args: { path: '.' } }]);
    assert.equal(response.content, 'The project contains `src/` and `package.json`.');
    assert.equal(requestBodies[0].tool_choice, 'auto');
    assert.equal(requestBodies[0].max_tokens, 256);
    assert.equal(requestBodies[0].temperature, 0);
    assert.deepEqual(requestBodies[0].chat_template_kwargs, { enable_thinking: false });
    assert.equal(requestBodies[0].tools.length, 1);
    assert.equal(requestBodies[0].tools[0].function.name, 'fs_list');
    assert.equal(requestBodies[1].tool_choice, 'auto');
    assert.match(requestBodies[1].messages.at(-1).content, /package\.json/);
    assert.deepEqual(response.usage, { inputTokens: 13, outputTokens: 3 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the model can answer without selecting a tool', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  const executions: string[] = [];
  service.setToolProvider(toolProvider(), async name => {
    executions.push(name);
    return [];
  });

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'Hello!' } }],
      usage: { prompt_tokens: 4, completion_tokens: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat(projectRequest('Hello'));
    assert.equal(response.content, 'Hello!');
    assert.deepEqual(executions, []);
    assert.equal(fetchCount, 1);
    assert.deepEqual(response.usage, { inputTokens: 4, outputTokens: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streaming responses report phase-level performance metrics', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response([
    'data: {"model":"test-model","choices":[{"delta":{"content":"Hello"}}]}',
    '',
    'data: {"choices":[{"delta":{"content":" world"}}],"usage":{"prompt_tokens":4,"completion_tokens":2}}',
    '',
    'data: [DONE]',
    '',
  ].join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } });

  try {
    const deltas: string[] = [];
    const response = await service.streamChat({
      ...projectRequest('Hello'),
      enableTools: false,
    }, { onDelta: delta => deltas.push(delta) });

    assert.equal(response.content, 'Hello world');
    assert.deepEqual(deltas, ['Hello', ' world']);
    assert.ok(response.performance);
    assert.ok(response.performance.backendMs >= 0);
    assert.ok(response.performance.firstTokenMs !== undefined);
    assert.equal(response.performance.toolRounds, 0);
    assert.equal(response.performance.toolCalls, 0);
    assert.deepEqual(
      response.performance.phases.map(phase => phase.phase),
      ['preparation', 'answer-generation'],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deferred tool discovery keeps specialized schemas out of the first model request', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  const executions: string[] = [];
  service.setToolProvider(async () => [
    ...(await toolProvider()()),
    {
      name: 'mcp.callTool',
      description: 'Call a tool from an MCP server',
      inputSchema: {
        type: 'object',
        properties: { serverName: { type: 'string' }, toolName: { type: 'string' } },
        required: ['serverName', 'toolName'],
      },
      source: 'bridge',
      readOnly: false,
    },
  ], async name => {
    executions.push(name);
    return { ok: true };
  });

  const requestBodies: any[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requestBodies.push(body);
    if (requestBodies.length === 1) {
      const searchTool = body.tools.find((tool: any) => tool.function.name.includes('search_tools'));
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: '', tool_calls: [{
          id: 'search-call',
          type: 'function',
          function: { name: searchTool.function.name, arguments: '{"query":"MCP call"}' },
        }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (requestBodies.length === 2) {
      const mcpTool = body.tools.find((tool: any) => tool.function.name === 'mcp_callTool');
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: '', tool_calls: [{
          id: 'mcp-call',
          type: 'function',
          function: { name: mcpTool.function.name, arguments: '{"serverName":"demo","toolName":"ping"}' },
        }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'The MCP tool completed.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat({
      ...projectRequest('Use the MCP demo ping tool.'),
      maxToolRounds: 2,
    });
    assert.equal(response.content, 'The MCP tool completed.');
    assert.equal(requestBodies[0].tools.some((tool: any) => tool.function.name === 'mcp_callTool'), false);
    assert.equal(requestBodies[0].tools.some((tool: any) => tool.function.name.includes('search_tools')), true);
    assert.equal(requestBodies[1].tools.some((tool: any) => tool.function.name === 'mcp_callTool'), true);
    assert.deepEqual(executions, ['mcp.callTool']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('project scope enforcement never reports an unobserved external directory as empty', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  service.setToolProvider(toolProvider(), async () => {
    throw new Error('The external path must not reach the project-scoped tool executor');
  });

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error('The model must not override a deterministic workspace authorization boundary');
  };

  try {
    const response = await service.chat(projectRequest('What is under /Users/example/?'));
    assert.match(response.content, /did not inspect `\/Users\/example`/);
    assert.match(response.content, /outside this project chat's authorized workspace/);
    assert.doesNotMatch(response.content, /empty directory/i);
    assert.equal(fetchCount, 0);
    assert.deepEqual(response.usage, { inputTokens: 0, outputTokens: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ask permission profile lets the model interpret external-path requests instead of pre-blocking path mentions', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'I can request approval before accessing that external path.' } }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat({
      ...projectRequest('Are you able to write to /tmp/test.txt?'),
      permissionProfile: 'ask',
      enableTools: false,
    });
    assert.equal(fetchCount, 1);
    assert.match(response.content, /request approval/);
    assert.notDeepEqual(response.usage, { inputTokens: 0, outputTokens: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a denied filesystem observation cannot be rewritten as an empty directory', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-chat-workspace');
  service.setToolProvider(toolProvider(), async () => {
    throw new Error(
      'Access denied by the workspace-only permission profile: /Users/example/git is outside the active workspace /tmp/codeagent-chat-workspace.',
    );
  });

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: {
          content: '',
          tool_calls: [{
            id: 'call-list-denied',
            type: 'function',
            function: { name: 'fs_list', arguments: '{"path":"/Users/example/git"}' },
          }],
        } }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'That directory is empty.' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat({
      messages: [{ role: 'user', content: 'Show me what is in /Users/example/git' }],
      provider: 'codeagent',
      model: 'test-model',
      enableTools: true,
      permissionProfile: 'workspace-only',
      toolScope: { source: 'chat', workspacePath: '/tmp/codeagent-chat-workspace' },
    });
    assert.match(response.content, /couldn’t complete/i);
    assert.match(response.content, /access denied by the workspace-only permission profile/i);
    assert.doesNotMatch(response.content, /directory is empty/i);
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('textual tool-call fallback remains compatible with providers that omit native tool_calls', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  service.setToolProvider(toolProvider(), async () => []);

  const originalFetch = globalThis.fetch;
  const toolChoices: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    toolChoices.push(body.tool_choice);
    if (toolChoices.length === 1) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: '{"name":"fs_list","arguments":{"path":"."}}' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (toolChoices.length === 2) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: 'I can still answer normally.' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'I can still answer normally.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat(projectRequest('Explain dependency injection.'));
    assert.equal(response.content, 'I can still answer normally.');
    assert.deepEqual(toolChoices, ['auto', 'auto']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the agent loop does not execute an identical model-selected tool call twice', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  let executionCount = 0;
  service.setToolProvider(toolProvider(), async () => {
    executionCount += 1;
    return [];
  });

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    if (fetchCount === 1 || fetchCount === 2) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: {
          content: '',
          tool_calls: [{
            id: `call-${fetchCount}`,
            type: 'function',
            function: { name: 'fs_list', arguments: '{"path":"."}' },
          }],
        } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'The tool-selection and execution stage is complete for this turn.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat({ ...projectRequest('Inspect the workspace.'), maxToolRounds: 4 });
    assert.equal(executionCount, 1);
    assert.equal(fetchCount, 3);
    assert.match(response.content, /verified tool result/i);
    assert.match(response.content, /fs_list/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the bundled agent returns directory observations to the model before answering', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  service.setToolProvider(toolProvider(), async () => ({
    absolutePath: '/tmp/codeagent-project',
    exists: true,
    empty: false,
    totalCount: 3,
    returnedCount: 2,
    omittedCount: 1,
    entries: [
      { name: 'package.json', type: 'file' },
      { name: 'src', type: 'directory' },
    ],
  }));

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    if (fetchCount === 2) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: {
          content: 'The directory contains `package.json` and `src/`, with one additional entry omitted.',
        } }],
        usage: { prompt_tokens: 8, completion_tokens: 4 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: {
        content: '',
        tool_calls: [{
          id: 'call-list-grounded',
          type: 'function',
          function: { name: 'fs_list', arguments: '{"path":"."}' },
        }],
      } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat(projectRequest('What is in this directory?'));
    assert.equal(fetchCount, 2);
    assert.match(response.content, /package\.json/);
    assert.match(response.content, /src\//);
    assert.match(response.content, /one additional entry/);
    assert.doesNotMatch(response.content, /Verified tool result|fs_list/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a directory observation does not replace synthesis for a project assessment question', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  service.setToolProvider(toolProvider(), async () => ({
    absolutePath: '/tmp/codeagent-project',
    exists: true,
    empty: true,
    totalCount: 0,
    returnedCount: 0,
    omittedCount: 0,
    entries: [],
  }));

  const requestBodies: any[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requestBodies.push(JSON.parse(String(init?.body)));
    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: {
          content: '',
          tool_calls: [{
            id: 'call-assessment-list',
            type: 'function',
            function: { name: 'fs_list', arguments: '{"path":"."}' },
          }],
        } }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: {
        content: 'No. The project workspace is empty, so none of the stated design goals are implemented yet.',
      } }],
      usage: { prompt_tokens: 9, completion_tokens: 5 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat(projectRequest('Have we implemented all the design goals for the project?'));
    assert.equal(requestBodies.length, 2);
    assert.match(requestBodies[1].messages.at(-1).content, /"absolutePath":"\/tmp\/codeagent-project"/);
    assert.match(response.content, /none of the stated design goals are implemented/i);
    assert.doesNotMatch(response.content, /^`\/tmp\/codeagent-project` exists and is empty\.$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a project chat retries a recoverable wrong-root directory call instead of ending the run', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  const executions: Array<{ name: string; args: Record<string, unknown> }> = [];
  service.setToolProvider(toolProvider(), async (name, args) => {
    executions.push({ name, args });
    if (args.path === 'codeagent-project') {
      throw new Error('Directory not found: codeagent-project');
    }
    return {
      absolutePath: '/tmp/codeagent-project',
      exists: true,
      empty: true,
      totalCount: 0,
      returnedCount: 0,
      omittedCount: 0,
      entries: [],
    };
  });

  const requestBodies: any[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requestBodies.push(body);
    const responseNumber = requestBodies.length;
    if (responseNumber === 1) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: {
          content: '',
          tool_calls: [{
            id: 'call-wrong-project-root',
            type: 'function',
            function: { name: 'fs_list', arguments: '{"path":"codeagent-project"}' },
          }],
        } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (responseNumber === 2) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: 'I cannot continue because the directory was not found.' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (responseNumber === 3) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: {
          content: '',
          tool_calls: [{
            id: 'call-correct-project-root',
            type: 'function',
            function: { name: 'fs_list', arguments: '{"path":"."}' },
          }],
        } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'The project workspace is empty, so implementation can begin now.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat(projectRequest('Proceed to complete all project goals.'));
    assert.deepEqual(executions, [
      { name: 'fs.list', args: { path: 'codeagent-project' } },
      { name: 'fs.list', args: { path: '.' } },
    ]);
    assert.equal(response.content, 'The project workspace is empty, so implementation can begin now.');
    assert.match(requestBodies[0].messages[0].content, /workspace root itself as "\."/);
    assert.match(requestBodies[2].messages.at(-1).content, /recoverable path error/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a structured project turn cannot finish an action request before a mutating tool succeeds', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  const executions: Array<{ name: string; args: Record<string, unknown> }> = [];
  service.setToolProvider(async () => [{
    name: 'fs.write',
    description: 'Write a file in the project workspace',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
    source: 'bridge',
    readOnly: false,
  }], async (name, args) => {
    executions.push({ name, args });
    return { path: args.path, written: true };
  });

  const requestBodies: any[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requestBodies.push(body);
    const finishTool = body.tools.find((tool: any) => tool.function.name.includes('finish_project_turn'));
    const writeTool = body.tools.find((tool: any) => tool.function.name === 'fs_write');

    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: '', tool_calls: [{
          id: 'finish-too-early',
          type: 'function',
          function: {
            name: finishTool.function.name,
            arguments: JSON.stringify({
              requestRequiresWorkspaceChanges: true,
              outcome: 'answered',
              response: "Let's proceed with setting up the project structure.",
            }),
          },
        }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (requestBodies.length === 2) {
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: '', tool_calls: [{
          id: 'write-main',
          type: 'function',
          function: {
            name: writeTool.function.name,
            arguments: JSON.stringify({ path: 'main.py', content: 'from fastapi import FastAPI\n' }),
          },
        }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: '', tool_calls: [{
        id: 'finish-after-write',
        type: 'function',
        function: {
          name: finishTool.function.name,
          arguments: JSON.stringify({
            requestRequiresWorkspaceChanges: true,
            outcome: 'completed',
            response: 'Created the FastAPI project entry point.',
          }),
        },
      }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat({
      ...projectRequest('Yes, please proceed to complete the project.'),
      structuredAgentLoop: true,
    });
    assert.equal(response.content, 'Created the FastAPI project entry point.');
    assert.deepEqual(executions, [{
      name: 'fs.write',
      args: { path: 'main.py', content: 'from fastapi import FastAPI\n' },
    }]);
    assert.equal(requestBodies.length, 3);
    assert.equal(requestBodies[0].tool_choice, 'required');
    assert.equal(requestBodies[1].max_tokens, 1024);
    assert.match(requestBodies[1].messages.at(-1).content, /no mutating tool has succeeded/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a structured project turn corrects an fs.write directory path instead of ending as blocked', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  const executions: Array<{ name: string; args: Record<string, unknown> }> = [];
  service.setToolProvider(async () => [{
    name: 'fs.write',
    description: 'Write a file in the project workspace',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
    source: 'bridge',
    readOnly: false,
  }], async (name, args) => {
    executions.push({ name, args });
    if (args.path === '.') {
      throw new Error('Failed to read existing file for review: EISDIR: illegal operation on a directory, read');
    }
    return { path: args.path, written: true };
  });

  const requestBodies: any[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requestBodies.push(body);
    const finishTool = body.tools.find((tool: any) => tool.function.name.includes('finish_project_turn'));
    const writeTool = body.tools.find((tool: any) => tool.function.name === 'fs_write');
    const responseNumber = requestBodies.length;
    const toolCall = responseNumber === 1
      ? {
          id: 'write-directory',
          type: 'function',
          function: { name: writeTool.function.name, arguments: '{"path":".","content":"app"}' },
        }
      : responseNumber === 2
        ? {
            id: 'blocked-too-early',
            type: 'function',
            function: {
              name: finishTool.function.name,
              arguments: JSON.stringify({
                requestRequiresWorkspaceChanges: true,
                outcome: 'blocked',
                response: 'The required tool access was unavailable.',
              }),
            },
          }
        : responseNumber === 3
          ? {
              id: 'write-file',
              type: 'function',
              function: { name: writeTool.function.name, arguments: '{"path":"main.py","content":"app"}' },
            }
          : {
              id: 'finish-corrected-write',
              type: 'function',
              function: {
                name: finishTool.function.name,
                arguments: JSON.stringify({
                  requestRequiresWorkspaceChanges: true,
                  outcome: 'completed',
                  response: 'Created main.py.',
                }),
              },
            };
    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: '', tool_calls: [toolCall] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat({
      ...projectRequest('Continue and finish the project goals.'),
      structuredAgentLoop: true,
    });
    assert.equal(response.content, 'Created main.py.');
    assert.deepEqual(executions.map(execution => execution.args.path), ['.', 'main.py']);
    assert.match(requestBodies[2].messages.at(-1).content, /fs\.write must name a file/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a structured project turn gets corrective rounds after a missing executable', async () => {
  const service = new ApiServiceBridge(undefined, '/tmp/codeagent-project');
  service.setToolProvider(async () => [{
    name: 'bash.run',
    description: 'Run a project command',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string' }, cwd: { type: 'string' } },
      required: ['command'],
    },
    source: 'bridge',
    readOnly: false,
  }], async () => {
    throw new Error('Executable not found: uvicorn. Install it or add its directory to PATH.');
  });

  const requestBodies: any[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requestBodies.push(body);
    const finishTool = body.tools.find((tool: any) => tool.function.name.includes('finish_project_turn'));
    const commandTool = body.tools.find((tool: any) => tool.function.name === 'bash_run');
    const toolCall = requestBodies.length === 1
      ? {
          id: 'run-missing-command',
          type: 'function',
          function: { name: commandTool.function.name, arguments: '{"command":"uvicorn main:app","cwd":"."}' },
        }
      : {
          id: 'finish-after-observed-failure',
          type: 'function',
          function: {
            name: finishTool.function.name,
            arguments: JSON.stringify({
              requestRequiresWorkspaceChanges: false,
              outcome: 'blocked',
              response: 'The runtime dependency still needs to be installed.',
            }),
          },
        };
    return new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: '', tool_calls: [toolCall] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await service.chat({
      ...projectRequest('Run and verify the project.'),
      structuredAgentLoop: true,
      maxToolRounds: 1,
    });
    assert.equal(requestBodies.length, 2);
    assert.match(requestBodies[1].messages.at(-1).content, /recoverable command, dependency, or path error/i);
    assert.match(response.content, /Executable not found: uvicorn/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
