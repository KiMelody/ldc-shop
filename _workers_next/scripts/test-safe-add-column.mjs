/**
 * Offline smoke test for extractSqliteMessage + safeAddColumn error handling.
 * Run with: node scripts/test-safe-add-column.mjs
 *
 * Mocks the various error shapes that D1, better-sqlite3, and raw SQLite
 * throw, then asserts each one is correctly classified as "duplicate column".
 */

class MockD1Error extends Error {
    // Simulate the D1 Workers case where `.message` is a non-enumerable own property.
    constructor(message) {
        super();
        Object.defineProperty(this, 'message', {
            value: message,
            enumerable: false,
            writable: true,
            configurable: true,
        });
        // Make toString() return [object Object] like in real D1
        this.toString = () => '[object Object]';
    }
}

class MockD1ErrorCause extends Error {
    constructor(message) {
        super();
        Object.defineProperty(this, 'message', {
            value: message,
            enumerable: false,
            writable: true,
            configurable: true,
        });
        this.cause = { message: message };
    }
}

class MockPlainError extends Error {
    constructor(message) {
        super(message);
    }
}

class MockJsonError {
    constructor(message) {
        this.message = message;
    }
    toString() {
        return 'Error: ' + this.message;
    }
}

// Re-implement the production function under test (must mirror src/lib/db/queries.ts).
async function extractSqliteMessage(err) {
    if (!err) return '';
    const parts = [];
    if (typeof err.message === 'string') parts.push(err.message);
    if (err.cause && typeof err.cause.message === 'string') parts.push(err.cause.message);
    if (err.cause && err.cause.cause && typeof err.cause.cause.message === 'string') {
        parts.push(err.cause.cause.message);
    }
    try {
        const json = JSON.stringify(err);
        if (json && json !== '{}') parts.push(json);
    } catch { /* ignore */ }
    try {
        parts.push(String(err));
    } catch { /* ignore */ }
    try {
        if (typeof err.toString === 'function') {
            const s = err.toString();
            if (s && s !== '[object Object]') parts.push(s);
        }
    } catch { /* ignore */ }
    return parts.join(' | ');
}

async function classifyDuplicateColumn(err) {
    const errorMessage = (await extractSqliteMessage(err)).toLowerCase();
    return errorMessage.includes('duplicate column');
}

const cases = [
    {
        name: 'D1 Workers non-enumerable message (the actual bug)',
        err: new MockD1Error('duplicate column name: reserved_order_id: SQLITE_ERROR'),
        expected: true,
    },
    {
        name: 'D1 with .cause.message chain',
        err: new MockD1ErrorCause('duplicate column name: foo: SQLITE_ERROR'),
        expected: true,
    },
    {
        name: 'Plain SQLite Error (better-sqlite3)',
        err: new MockPlainError('duplicate column name: bar'),
        expected: true,
    },
    {
        name: 'Custom error with toString()',
        err: new MockJsonError('duplicate column name: baz: SQLITE_ERROR'),
        expected: true,
    },
    {
        name: 'Unrelated D1 error (should NOT be classified)',
        err: new MockD1Error('table cards has no column named foo: SQLITE_ERROR'),
        expected: false,
    },
    {
        name: 'Unrelated plain error',
        err: new MockPlainError('database is locked'),
        expected: false,
    },
    {
        name: 'Null/undefined (edge case)',
        err: null,
        expected: false,
    },
];

let passed = 0;
let failed = 0;
for (const c of cases) {
    const result = await classifyDuplicateColumn(c.err);
    const ok = result === c.expected;
    if (ok) {
        passed++;
        console.log(`  ✓ ${c.name}`);
    } else {
        failed++;
        console.log(`  ✗ ${c.name}`);
        console.log(`    expected: ${c.expected}, got: ${result}`);
        console.log(`    raw err:`, c.err);
        console.log(`    extractSqliteMessage:`, await extractSqliteMessage(c.err));
    }
}

console.log(`\n${passed}/${cases.length} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
