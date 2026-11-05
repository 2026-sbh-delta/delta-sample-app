// Test-only pg replacement loaded through a Node resolver hook.
import { fakeClient } from './deployment-contract.mjs';

export const state = { version: 180003, queries: [] };

export class Pool {
  on() {}
  async end() {}
  async query(statement) {
    const sql = typeof statement === 'string' ? statement : statement.text;
    state.queries.push(sql);
    if (/server_version_num/i.test(sql)) return { rows: [{ server_version_num: String(state.version) }] };
    // staging 헬스는 남은 행 수를 COUNT로 읽는다. 기본값은 초기화 직후(0건).
    const count = /\bcount\s*\(\s*\*\s*\)\s+AS\s+"?(\w+)"?/i.exec(sql);
    if (count) return { rows: [{ [count[1]]: '0' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }
}

// CLI success serialization is checked without a socket or real credentials.
export class Client {
  constructor() { return fakeClient().client; }
}

export default { Client, Pool };
