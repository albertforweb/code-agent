import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
const modelBundler = readFileSync(new URL('./bundle-starter-model.mjs', import.meta.url), 'utf8')

assert.match(workflow, /draft:\s*\n\s+description:[\s\S]*?default: false/, 'manual releases must publish by default')
assert.match(workflow, /if \[\[ "\$\{tag\}" != v\* \]\]/, 'manual tags must be normalized to v-prefixed release tags')
assert.match(workflow, /edit_args=.*--draft="\$\{RELEASE_DRAFT\}"/, 'reruns must preserve the requested draft state')
assert.match(workflow, /gh release edit "\$\{RELEASE_TAG\}" "\$\{edit_args\[@\]\}"/, 'reruns must update the existing release')
assert.match(workflow, /asset_count=.*gh release view/, 'release publishing must verify uploaded assets')
assert.match(workflow, /llama_target: win32-x64/, 'Windows desktop releases must select the Windows x64 llama.cpp build')
assert.match(workflow, /bundle-llama-engine\.mjs --target \$\{\{ matrix\.llama_target \}\}/, 'desktop releases must explicitly bundle the matrix inference engine')
assert.match(workflow, /verify:llama:windows/, 'Windows desktop releases must verify the packaged local inference engine')
assert.match(workflow, /npm run bundle:model:desktop/, 'desktop releases must bundle the offline starter model')
assert.match(workflow, /verify:model/, 'desktop releases must verify the packaged offline starter model')
assert.match(modelBundler, /huggingface\.co\/\$\{repository\}\/resolve\/\$\{encodeURIComponent\(model\.revision\)\}/, 'starter model downloads must use the public revision-pinned Hugging Face resolver')
assert.doesNotMatch(modelBundler, /huggingface\.co\/api\/resolve-cache/, 'starter model downloads must not use Hugging Face internal cache URLs')
assert.match(workflow, /HF_TOKEN:\s*\$\{\{ secrets\.HF_TOKEN \}\}/, 'release jobs must support an optional Hugging Face token')

console.log('Release workflow publication checks passed.')
