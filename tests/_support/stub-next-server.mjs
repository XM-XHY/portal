/**
 * next/server 桩：纯 Node 环境无法解析 Next 内部的 next/server 导出，
 * 用最小实现替身注入（经 loadTs 的 stub 映射），使 /api/works/pay/[action]/route.ts
 * 可在无 Next 运行期的情况下被直接导入并断言。
 *
 * 仅实现被测路径用到的 API：NextResponse.json(body, init) 返回带 status / headers / json() 的对象；
 * NextRequest 仅包装 .json() 与 .headers.get()。
 */
export class NextRequest {
  constructor(init = {}) {
    this._json = init.json;
    const headersMap = init.headers || {};
    this.headers = {
      get: (k) => (k && headersMap[String(k).toLowerCase()] != null ? headersMap[String(k).toLowerCase()] : null),
    };
  }
  async json() {
    if (typeof this._json === "function") return this._json();
    if (typeof this._json === "string") return JSON.parse(this._json);
    return this._json || {};
  }
}

export class NextResponse {
  static json(body, init = {}) {
    const status = init && init.status ? init.status : 200;
    const headers = (init && init.headers) || {};
    return {
      status,
      headers,
      async json() {
        return body;
      },
    };
  }
}
