#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const packageJson = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
);

const options = parseArgs(process.argv.slice(2));
const version = normalizeVersion(options.version ?? packageJson.version);
const outputDir = path.resolve(
  root,
  options.outputDir ?? path.join('dist-build', 'release-notes'),
);
const outputPath = path.join(outputDir, `CodeAgent-${version}.md`);
const toRef = options.to ?? 'HEAD';
const fromRef = options.from ?? findPreviousTag(version);
const includeCommitHistory = Boolean(fromRef) || options.includeInitialHistory;
const commits = includeCommitHistory
  ? collectCommits(fromRef, toRef, options.limit)
  : [];
const dirtyStatus = git(['status', '--short'], true);
const generatedAt = new Date().toISOString().slice(0, 10);
const markdown = renderReleaseNotes({
  version,
  packageVersion: packageJson.version,
  generatedAt,
  fromRef,
  toRef,
  includeCommitHistory,
  commits,
  dirtyStatus,
});

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, markdown, 'utf8');

if (options.stdout) {
  process.stdout.write(markdown);
}

console.log(`Release notes written to ${path.relative(root, outputPath)}`);

function parseArgs(args) {
  const parsed = {
    limit: 100,
    stdout: false,
    includeInitialHistory: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--from') {
      parsed.from = readValue(args, ++index, arg);
    } else if (arg === '--to') {
      parsed.to = readValue(args, ++index, arg);
    } else if (arg === '--version') {
      parsed.version = readValue(args, ++index, arg);
    } else if (arg === '--output-dir') {
      parsed.outputDir = readValue(args, ++index, arg);
    } else if (arg === '--limit') {
      parsed.limit = Number.parseInt(readValue(args, ++index, arg), 10);
      if (!Number.isFinite(parsed.limit) || parsed.limit < 1) {
        throw new Error('--limit must be a positive integer.');
      }
    } else if (arg === '--stdout') {
      parsed.stdout = true;
    } else if (arg === '--include-initial-history') {
      parsed.includeInitialHistory = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function normalizeVersion(value) {
  const trimmed = String(value).trim();
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

function git(args, allowFailure = false) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if ((result.status ?? 1) !== 0) {
    if (allowFailure) return '';
    throw new Error(
      `git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
    );
  }

  return result.stdout.trim();
}

function findPreviousTag(currentVersion) {
  const tags = git(['tag', '--sort=-creatordate', '--list', 'v*'], true)
    .split('\n')
    .map(tag => tag.trim())
    .filter(Boolean);

  return tags.find(tag => tag !== currentVersion) ?? '';
}

function collectCommits(fromRef, toRef, limit) {
  const range = fromRef ? `${fromRef}..${toRef}` : toRef;
  const log = git(
    [
      'log',
      `--max-count=${limit}`,
      '--pretty=format:%h%x09%s%x09%an',
      range,
    ],
    true,
  );

  if (!log) return [];

  return log.split('\n').map(line => {
    const [hash = '', subject = '', author = ''] = line.split('\t');
    return { hash, subject: sanitizeSubject(subject), author };
  });
}

function renderReleaseNotes({
  version,
  packageVersion,
  generatedAt,
  fromRef,
  toRef,
  includeCommitHistory,
  commits,
  dirtyStatus,
}) {
  const groups = groupCommits(commits);
  const lines = [
    `# CodeAgent ${version} Release Notes`,
    '',
    `Generated: ${generatedAt}`,
    `Package version: ${packageVersion}`,
    `Source range: ${fromRef ? `${fromRef}..${toRef}` : toRef}`,
    '',
  ];

  if (dirtyStatus) {
    lines.push(
      '## Local Working Tree',
      '',
      '- Generated with uncommitted local changes present. Regenerate after committing before publishing a final release.',
      '',
    );
  }

  lines.push(
    '## Artifact Checklist',
    '',
    `- [ ] CLI npm tarball: dist-build/cli/code-agent-${packageVersion}.tgz`,
    '- [ ] macOS desktop app or installers under dist-build/',
    '- [ ] iOS simulator or TestFlight build under dist-build/ios/ or Xcode Archives',
    '- [ ] Release notes markdown under dist-build/release-notes/',
    '',
    '## Verification Checklist',
    '',
    '- [ ] npm run pack:cli:check',
    '- [ ] npm run pack:desktop:check',
    '- [ ] npm run verify:ios-companion',
    '- [ ] npm run verify:remote-control-smoke',
    '- [ ] npm run verify:phase5',
    '',
    '## Deferred Public Distribution Gates',
    '',
    `- Deferred until npm publishing is available: npm publish dist-build/cli/code-agent-${packageVersion}.tgz`,
    '- Deferred until an Apple Developer Program account and Developer ID certificate are available: macOS signing and notarization.',
    '- Deferred until a signed GitHub release exists: auto-update download and install validation.',
    '- Deferred until release CI artifacts are produced for a public candidate: Windows and Linux installer review.',
    '- Deferred until an Apple Developer Program account and App Store Connect app record are available: TestFlight/App Store distribution.',
    '- Deferred until relay security is implemented: off-network relay identity, encryption, token rotation, audit propagation, and revocation.',
    '',
    '## Changes',
    '',
  );

  if (commits.length === 0) {
    if (!includeCommitHistory && !fromRef) {
      lines.push(
        '- No previous release tag was found, so old pre-release commit history is not listed by default.',
        '- Use --include-initial-history only when the first-release git history has been reviewed for release-safe wording.',
        '',
      );
    } else {
      lines.push('- No commits found for this range.', '');
    }
  } else {
    for (const group of groups) {
      if (group.commits.length === 0) continue;
      lines.push(`### ${group.title}`, '');
      for (const commit of group.commits) {
        lines.push(`- ${commit.subject} (${commit.hash})`);
      }
      lines.push('');
    }
  }

  lines.push(
    '## Release Owner Notes',
    '',
    '- Replace unchecked boxes with checked boxes only after each artifact or gate is validated for the release candidate.',
    '- Keep this file attached to the GitHub release or CI artifact set so CLI, desktop, and iOS package state can be audited together.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

function sanitizeSubject(subject) {
  const removedBrandPatterns = [
    {
      pattern: removedBrandRegex(['C', 'l', 'a', 'u', 'd', 'e', ' ', 'C', 'o', 'd', 'e']),
      replacement: 'legacy upstream product',
    },
    {
      pattern: removedBrandRegex(['C', 'l', 'a', 'u', 'd', 'e']),
      replacement: 'legacy upstream provider',
    },
    {
      pattern: removedBrandRegex(['A', 'n', 't', 'h', 'r', 'o', 'p', 'i', 'c']),
      replacement: 'legacy upstream provider',
    },
  ];

  return removedBrandPatterns.reduce(
    (value, { pattern, replacement }) => value.replace(pattern, replacement),
    subject,
  );
}

function removedBrandRegex(chars) {
  return new RegExp(chars.join(''), 'gi');
}

function groupCommits(commits) {
  const groupDefinitions = [
    {
      title: 'Features',
      match: subject => /^(feat|feature)(\(.+\))?:/i.test(subject),
    },
    {
      title: 'Fixes',
      match: subject => /^fix(\(.+\))?:/i.test(subject),
    },
    {
      title: 'Packaging And Distribution',
      match: subject =>
        /(packag|release|dist|installer|notar|sign|desktop|electron|cli|npm|ios|testflight|simulator|update)/i.test(
          subject,
        ),
    },
    {
      title: 'Remote Control',
      match: subject =>
        /(remote control|remote-control|pair|approval|relay|device|token)/i.test(
          subject,
        ),
    },
    {
      title: 'Documentation',
      match: subject => /^docs?(\(.+\))?:/i.test(subject),
    },
    {
      title: 'Tests And Verification',
      match: subject =>
        /^(test|tests)(\(.+\))?:/i.test(subject) ||
        /(verify|verification|smoke|test)/i.test(subject),
    },
    {
      title: 'Maintenance',
      match: subject =>
        /^(build|ci|chore|refactor|style|perf)(\(.+\))?:/i.test(subject),
    },
  ];

  const groups = groupDefinitions.map(group => ({
    title: group.title,
    commits: [],
    match: group.match,
  }));
  const other = { title: 'Other Changes', commits: [] };

  for (const commit of commits) {
    const group = groups.find(candidate => candidate.match(commit.subject));
    if (group) {
      group.commits.push(commit);
    } else {
      other.commits.push(commit);
    }
  }

  return [...groups, other].map(({ title, commits }) => ({ title, commits }));
}

function printHelp() {
  console.log(`Usage: node scripts/generate-release-notes.mjs [options]

Options:
  --from <ref>         Previous release tag or git ref. Defaults to latest v* tag before the target version.
  --to <ref>           Target git ref. Defaults to HEAD.
  --version <version>  Release version. Defaults to package.json version.
  --output-dir <path>  Output directory. Defaults to dist-build/release-notes.
  --limit <count>      Maximum commits to include. Defaults to 100.
  --stdout            Also print the generated markdown.
  --include-initial-history
                      Include old commit history when no previous v* tag exists.
  -h, --help           Show this help.
`);
}
