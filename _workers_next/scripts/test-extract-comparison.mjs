/**
 * Compare OLD vs NEW error extraction on the same D1 error shape.
 * Run with: node scripts/test-extract-comparison.mjs
 *
 * Demonstrates that the old (JSON.stringify + String()) approach FAILS
 * on the D1 Workers case and the new approach SUCCEEDS.
 */

class MockD1Error extends Error {
    constructor(message) {
        super();
        Object.defineProperty(this, 'message', {
            value: message,
            enumerable: false,
            writable: true,
            configurable: true,
        });
        this.toString = () => '[object Object]';
    }
}

function oldExtract(err) {
    return (JSON.stringify(err) + String(err)).toLowerCase();
}

async function newExtract(err) {
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
    return parts.join(' | ').toLowerCase();
}

const realD1Error = new MockD1Error('duplicate column name: reserved_order_id: SQLITE_ERROR');

console.log('--- D1 Workers error: duplicate column name: reserved_order_id ---');
console.log('OLD extraction:', JSON.stringify(oldExtract(realD1Error)));
console.log('  → contains "duplicate column"?', oldExtract(realD1Error).includes('duplicate column'));
console.log('  → would be classified as duplicate-column-safe?',
    oldExtract(realD1Error).includes('duplicate column') ? 'YES' : 'NO  ← bug re-throws the error');

console.log();
console.log('NEW extraction:', JSON.stringify(await newExtract(realD1Error)));
console.log('  → contains "duplicate column"?', (await newExtract(realD1Error)).includes('duplicate column'));
console.log('  → would be classified as duplicate-column-safe?',
    (await newExtract(realD1Error)).includes('duplicate column') ? 'YES' : 'NO');
