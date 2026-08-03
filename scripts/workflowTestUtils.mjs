// Utilidades de prueba del Workflow Engine (sin dependencias externas).
let total = 0;
let passed = 0;
const failures = [];

export function assert(cond, name) {
  total += 1;
  if (cond) {
    passed += 1;
    process.stdout.write(`  ✓ ${name}\n`);
  } else {
    failures.push(name);
    process.stdout.write(`  ✗ ${name}\n`);
  }
}

export function summarize(suite) {
  process.stdout.write(`\n[${suite}] ${passed}/${total} passed\n`);
  if (failures.length) {
    process.stdout.write(`FALLOS: ${failures.join(', ')}\n`);
    process.exitCode = 1;
  }
  total = 0;
  passed = 0;
  failures.length = 0;
}