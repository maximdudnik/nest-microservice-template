/** Whole-graph backstop for the hexagonal rules (standards §2). `rushx depcruise` */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-orphans',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', '\\.spec\\.ts$', '^src/(main|instrumentation|migrate)\\.ts$'],
      },
      to: {},
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      from: { path: '^src/[^/]+/domain/' },
      to: { pathNot: ['^src/[^/]+/domain/', '^src/shared/kernel/'] },
    },
    {
      name: 'application-depends-inward-only',
      severity: 'error',
      from: { path: '^src/[^/]+/application/' },
      to: {
        pathNot: ['^src/[^/]+/(application|domain)/', '^src/shared/kernel/', '@nestjs/common'],
      },
    },
    {
      name: 'no-cross-context',
      severity: 'error',
      comment: 'Bounded contexts talk via HTTP/RabbitMQ only',
      from: { path: '^src/([^/]+)/(domain|application|infrastructure)/' },
      to: {
        path: '^src/[^/]+/(domain|application|infrastructure)/',
        pathNot: ['^src/$1/', '^src/shared/'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.spec\\.ts$', '\\.int-spec\\.ts$'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
