#!/usr/bin/env node
// Enforces Rush project-tag dependency rules (standards §2). Rush does not enforce them itself.
// Rules: services never depend on services; libs never depend on services;
// a service may only depend on bc:* libs of its own bounded context.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const rush = JSON.parse(strip(readFileSync(join(root, 'rush.json'), 'utf8')));
const byName = new Map(rush.projects.map((p) => [p.packageName, p]));
const tag = (p, prefix) => (p.tags ?? []).find((t) => t.startsWith(prefix));
const errors = [];

for (const project of rush.projects) {
  const pkg = JSON.parse(readFileSync(join(root, project.projectFolder, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => byName.has(d));
  for (const dep of deps) {
    const target = byName.get(dep);
    const from = tag(project, 'type/');
    const to = tag(target, 'type/');
    if (to === 'type/service') errors.push(`${project.packageName} -> ${dep}: nothing may depend on a service`);
    if (from === 'type/lib-domain' && to === 'type/lib-infra')
      errors.push(`${project.packageName} -> ${dep}: lib-domain must not depend on lib-infra`);
    const fromBc = tag(project, 'bc/');
    const toBc = tag(target, 'bc/');
    if (fromBc && toBc && fromBc !== toBc)
      errors.push(`${project.packageName} -> ${dep}: cross bounded-context dependency (${fromBc} -> ${toBc})`);
  }
}

if (errors.length) {
  console.error('Rush tag violations:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`check-tags: ${rush.projects.length} projects OK`);
