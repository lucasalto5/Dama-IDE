import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseTestFailures } = require("../electron/professional-tools.cjs");

const failures = parseTestFailures("src/App.test.tsx:42:7 expected true\nFile \"tests/test_api.py\", line 18");
assert.equal(failures.length, 2);
assert.deepEqual(failures[0], { path: "src/App.test.tsx", line: 42, column: 7, message: "src/App.test.tsx:42:7 expected true" });
assert.equal(failures[1].path, "tests/test_api.py");
assert.equal(failures[1].line, 18);
console.log("Ferramentas profissionais: falhas de testes estruturadas e clicáveis validadas.");
