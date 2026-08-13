import { performance } from "node:perf_hooks";
import { cpus, freemem, homedir, platform, release, totalmem } from "node:os";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set(["node_modules", ".git", "dist", "coverage", ".cache"]);

async function filesIn(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await filesIn(fullPath, output);
    else output.push(fullPath);
  }
  return output;
}

async function measure(name, action) {
  const started = performance.now();
  const detail = await action();
  return { name, durationMs: Number((performance.now() - started).toFixed(2)), ...detail };
}

const projectScan = await measure("Leitura do projeto", async () => {
  const files = await filesIn(root);
  const sizes = await Promise.all(files.map(async (file) => (await stat(file)).size));
  return { items: files.length, bytes: sizes.reduce((sum, size) => sum + size, 0) };
});

const sampleNote = `# Nota de benchmark\n\nUma nota com **Markdown**, listas, links e imagens.\n\n- tarefa um\n- tarefa dois\n- [[outra nota]]\n\n![imagem](../attachments/exemplo.png)\n\n| Campo | Valor |\n| --- | --- |\n| Dama | rápida |\n`;
const markdownParse = await measure("Renderização de 500 notas", async () => {
  let tokens = 0;
  for (let index = 0; index < 500; index += 1) tokens += marked.lexer(`${sampleNote}\n${index}`).length;
  return { items: 500, tokens };
});

const noteRoundtrip = await measure("Salvar e reler 200 notas", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "dama-benchmark-"));
  try {
    for (let index = 0; index < 200; index += 1) await writeFile(path.join(temporary, `nota-${index}.md`), `${sampleNote}\n${index}`, "utf8");
    const names = await readdir(temporary);
    await Promise.all(names.map((name) => readFile(path.join(temporary, name), "utf8")));
    return { items: names.length };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

let bundle = { files: 0, bytes: 0 };
try {
  const distFiles = await filesIn(path.join(root, "dist"), []);
  const sizes = await Promise.all(distFiles.map(async (file) => (await stat(file)).size));
  bundle = { files: distFiles.length, bytes: sizes.reduce((sum, size) => sum + size, 0) };
} catch {}

const cpu = cpus();
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  appVersion: JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version,
  environment: {
    platform: `${platform()} ${release()}`,
    cpu: cpu[0]?.model || "desconhecida",
    logicalCores: cpu.length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    node: process.version,
  },
  results: [projectScan, markdownParse, noteRoundtrip],
  productionBundle: bundle,
};

const benchmarkDirectory = path.join(root, "benchmarks");
await mkdir(benchmarkDirectory, { recursive: true });
await writeFile(path.join(benchmarkDirectory, "latest.json"), JSON.stringify(report, null, 2), "utf8");
const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(2);
const markdown = `# Benchmark oficial da Dama\n\nGerado em ${report.generatedAt}. Execute novamente com \`npm run benchmark\`.\n\n## Ambiente\n\n- Sistema: ${report.environment.platform}\n- CPU: ${report.environment.cpu}\n- Núcleos lógicos: ${report.environment.logicalCores}\n- Memória total: ${megabytes(report.environment.totalMemoryBytes)} MB\n- Node: ${report.environment.node}\n\n## Resultados\n\n| Cenário | Itens | Tempo |\n| --- | ---: | ---: |\n${report.results.map((result) => `| ${result.name} | ${result.items} | ${result.durationMs} ms |`).join("\n")}\n\n## Build\n\n- Arquivos de produção: ${bundle.files}\n- Tamanho total: ${megabytes(bundle.bytes)} MB\n\n> Os números descrevem esta máquina e esta versão. Eles não substituem testes de abertura da janela e consumo de RAM do Electron, que devem ser medidos separadamente antes de publicar requisitos mínimos.\n`;
await writeFile(path.join(benchmarkDirectory, "latest.md"), markdown, "utf8");

console.log(markdown);
