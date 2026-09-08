/**
 * oxlint rules `openstory/no-*` (#1489): one banned-imports check, registered
 * once per concern so each concern is its own rule key.
 *
 * oxlint overrides replace a rule's whole config for the files they match,
 * so two concerns sharing the built-in `no-restricted-imports` could not be
 * layered: every override that lifted one ban had to restate the others
 * verbatim, and leaving one out silently lifted it. With a rule key per
 * concern an override is just "these files, this rule, off" — one file list
 * per question, nothing restated.
 *
 * Options (all rules): `{ modules, names?, message }`.
 *   - `modules`: glob-ish specifiers. `*` matches one path segment, `**`
 *     any depth, a leading `!` carves an exception out of the group.
 *   - `names`: when set, only these named imports from a matching module
 *     are banned (the module's other exports stay importable).
 *   - `import type` / `export type` never count: TypeScript erases them.
 *
 * `src/platform/server/db/db-access-allowlist.test.ts` pins the raw-db and
 * factory allowlists by resolving relative imports too, which a specifier
 * match cannot see.
 *
 * oxlint's JS-plugin API is alpha and ships no plugin/AST types, so the
 * ESTree shapes this rule touches are declared structurally below.
 */

type Position = { line: number; column: number };
type SourceLocation = { start: Position; end: Position };
type BaseNode = { type: string; loc?: SourceLocation | null };
type Specifier = BaseNode & {
  type: string;
  importKind?: 'type' | 'value';
  exportKind?: 'type' | 'value';
  /** Identifier, or a string Literal for `import { 'a-b' as ab }`. */
  imported?: { type: string; name?: string; value?: unknown };
  local?: { type: string; name?: string; value?: unknown };
};
type ImportLike = BaseNode & {
  importKind?: 'type' | 'value';
  exportKind?: 'type' | 'value';
  source?: { value: unknown } | null;
  specifiers?: Specifier[];
};

type Options = { modules: string[]; names?: string[]; message: string };
type Context = {
  options: Options[];
  report(diagnostic: { loc: SourceLocation; message: string }): void;
};

const OPTIONS_SCHEMA = [
  {
    type: 'object',
    properties: {
      modules: { type: 'array', items: { type: 'string' }, minItems: 1 },
      names: { type: 'array', items: { type: 'string' }, minItems: 1 },
      message: { type: 'string' },
    },
    required: ['modules', 'message'],
    additionalProperties: false,
  },
];

function globToRegExp(glob: string): RegExp {
  const src = glob
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*')
    )
    .join('.*');
  return new RegExp(`^${src}$`);
}

function matcher(modules: string[]): (specifier: string) => boolean {
  const allow = modules
    .filter((m) => m.startsWith('!'))
    .map((m) => globToRegExp(m.slice(1)));
  const deny = modules.filter((m) => !m.startsWith('!')).map(globToRegExp);
  return (specifier) =>
    deny.some((re) => re.test(specifier)) &&
    !allow.some((re) => re.test(specifier));
}

function importedName(spec: Specifier): string | null {
  if (spec.type === 'ImportSpecifier' || spec.type === 'ExportSpecifier') {
    const id = spec.imported ?? spec.local;
    if (!id) return null;
    if (typeof id.name === 'string') return id.name;
    return typeof id.value === 'string' ? id.value : null;
  }
  return null;
}

function create(context: Context) {
  const opts = context.options[0];
  if (!opts) throw new Error('boundaries: options required');
  const matches = matcher(opts.modules);
  const names = opts.names ? new Set(opts.names) : null;

  const check = (node: ImportLike) => {
    if (!node.source || typeof node.source.value !== 'string') return;
    if (node.importKind === 'type' || node.exportKind === 'type') return;
    if (!matches(node.source.value)) return;
    const specs = node.specifiers ?? [];
    if (names) {
      for (const spec of specs) {
        if (spec.importKind === 'type' || spec.exportKind === 'type') continue;
        const name = importedName(spec);
        if (name && names.has(name) && spec.loc) {
          context.report({ loc: spec.loc, message: opts.message });
        }
      }
      return;
    }
    // Every specifier type-only → nothing survives compilation.
    if (
      specs.length > 0 &&
      specs.every((s) => s.importKind === 'type' || s.exportKind === 'type')
    ) {
      return;
    }
    if (node.loc) context.report({ loc: node.loc, message: opts.message });
  };

  return {
    ImportDeclaration: check,
    ExportNamedDeclaration: check,
    ExportAllDeclaration: check,
    // `import('…')` keeps a module out of the eager graph but still ships it.
    ImportExpression: check,
  };
}

/**
 * `boundaries/wrong-place`: fires on every file it is enabled for. There is
 * nothing to inspect — the override's `files` glob IS the rule — so the
 * message is the whole config. Used to keep tests out of src/routes, where
 * the router plugin would generate them into the route tree.
 */
const WRONG_PLACE_SCHEMA = [
  {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message'],
    additionalProperties: false,
  },
];
const wrongPlace = {
  meta: {
    type: 'problem',
    docs: { description: 'This kind of file does not belong in this folder' },
    schema: WRONG_PLACE_SCHEMA,
  },
  create(context: {
    options: { message: string }[];
    report(d: { loc: SourceLocation; message: string }): void;
  }) {
    const message = context.options[0]?.message ?? 'wrong place';
    return {
      Program: (node: BaseNode) => {
        if (node.loc) context.report({ loc: node.loc, message });
      },
    };
  },
};

function rule(description: string) {
  return {
    meta: { type: 'problem', docs: { description }, schema: OPTIONS_SCHEMA },
    create,
  };
}

export default {
  meta: { name: 'boundaries' },
  rules: {
    'no-raw-db': rule(
      'The raw D1 handle is read only by the db-access allowlist'
    ),
    'no-scoped-factory': rule(
      'Only the request middlewares and the workflow base mint a ScopedDb'
    ),
    'no-sql': rule('SQL is written in the db layer only'),
    'no-server-imports': rule('Client code may not import src/**/server/**'),
    'platform-domain-blind': rule(
      'src/platform may not value-import a product domain'
    ),
    'wrong-place': wrongPlace,
  },
};
