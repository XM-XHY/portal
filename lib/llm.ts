/**
 * 大模型调用层（服务端专用）
 *
 * 设计目标：国内服务器直连可用，避免依赖 OpenAI 等海外端点。
 * 所有国内厂商都提供 OpenAI 兼容协议（POST /chat/completions + Bearer 鉴权），
 * 因此这里统一封装，切换厂商只需改环境变量，业务代码零改动。
 *
 * ── 配置方式（三选一，优先级从高到低）──────────────────────────
 * 1) 完全自定义：LLM_BASE_URL + LLM_API_KEY (+ LLM_MODEL)
 *    例：接自建/私有化模型、或厂商端点变更时
 * 2) 指定厂商：LLM_PROVIDER=deepseek|qwen|doubao|zhipu|kimi|minimax|openai
 *    + 对应厂商的密钥环境变量（见下方 keyEnv）
 * 3) 自动探测（默认）：按 DEEPSEEK → QWEN → DOUBAO → ZHIPU → KIMI → MINIMAX → OPENAI
 *    顺序，取第一个配了密钥的厂商。把国产排在前，保证国内部署默认走国产。
 *
 * ⚠️ model 型号各家迭代很快，下表为 2026-11 核对结果。
 *    若厂商已改名导致 404，用 LLM_MODEL 环境变量覆盖即可，无需改代码。
 */

export type LlmProviderId =
  | "deepseek"
  | "qwen"
  | "doubao"
  | "zhipu"
  | "kimi"
  | "minimax"
  | "openai"
  | "custom";

export type LlmPreset = {
  id: LlmProviderId;
  label: string;
  /** OpenAI 兼容端点（已含版本路径） */
  baseUrl: string;
  /** 默认模型；可用 LLM_MODEL 覆盖 */
  model: string;
  /** 该厂商密钥对应的环境变量名 */
  keyEnv: string;
  /** 控制台/申请地址，便于运维核对 */
  console: string;
};

export const LLM_PRESETS: Record<Exclude<LlmProviderId, "custom">, LlmPreset> = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek 深度求索",
    baseUrl: "https://api.deepseek.com/v1",
    // 注意：deepseek-chat / deepseek-reasoner 已于 2026-07-24 弃用，勿再使用
    model: "deepseek-v4-flash",
    keyEnv: "DEEPSEEK_API_KEY",
    console: "https://platform.deepseek.com",
  },
  qwen: {
    id: "qwen",
    label: "通义千问（阿里云百炼）",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    // 备选：qwen3.7-plus（更强）、qwen3.6-flash（更省）
    model: "qwen-plus",
    keyEnv: "DASHSCOPE_API_KEY",
    console: "https://bailian.console.aliyun.com",
  },
  doubao: {
    id: "doubao",
    label: "豆包（火山方舟）",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    // 火山方舟也支持「接入点 ID」作为 model，二选一即可
    model: "doubao-2.0-pro-256k",
    keyEnv: "ARK_API_KEY",
    console: "https://console.volcengine.com/ark",
  },
  zhipu: {
    id: "zhipu",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    // 备选：glm-5（旗舰）
    model: "glm-4.5-flash",
    keyEnv: "ZHIPU_API_KEY",
    console: "https://open.bigmodel.cn",
  },
  kimi: {
    id: "kimi",
    label: "Kimi 月之暗面",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    keyEnv: "MOONSHOT_API_KEY",
    console: "https://platform.moonshot.cn",
  },
  minimax: {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimax.chat/v1",
    model: "MiniMax-M2.5",
    keyEnv: "MINIMAX_API_KEY",
    console: "https://platform.minimaxi.com",
  },
  openai: {
    id: "openai",
    label: "OpenAI（海外，国内直连通常不通）",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyEnv: "OPENAI_API_KEY",
    console: "https://platform.openai.com",
  },
};

/** 自动探测顺序：国产优先，OpenAI 兜底（兼容历史配置） */
const PROBE_ORDER: Exclude<LlmProviderId, "custom">[] = [
  "deepseek",
  "qwen",
  "doubao",
  "zhipu",
  "kimi",
  "minimax",
  "openai",
];

export type LlmConfig = {
  provider: LlmProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  label: string;
};

/**
 * 解析当前生效的大模型配置；未配置任何密钥时返回 null（调用方应走规则兜底）。
 */
export function getLlmConfig(): LlmConfig | null {
  const base = process.env.LLM_BASE_URL?.trim();
  const genericKey = process.env.LLM_API_KEY?.trim();
  const modelOverride = process.env.LLM_MODEL?.trim();
  const forced = process.env.LLM_PROVIDER?.trim().toLowerCase();

  // 1) 完全自定义：给了 base + 任意 key
  if (base && genericKey) {
    const preset = forced ? LLM_PRESETS[forced as Exclude<LlmProviderId, "custom">] : undefined;
    return {
      provider: "custom",
      baseUrl: base,
      apiKey: genericKey,
      model: modelOverride || preset?.model || "deepseek-v4-flash",
      label: preset?.label || "自定义模型",
    };
  }

  // 2) 指定厂商
  if (forced && LLM_PRESETS[forced as Exclude<LlmProviderId, "custom">]) {
    const p = LLM_PRESETS[forced as Exclude<LlmProviderId, "custom">];
    const key = genericKey || process.env[p.keyEnv]?.trim();
    if (!key) return null;
    return {
      provider: p.id,
      baseUrl: base || p.baseUrl,
      apiKey: key,
      model: modelOverride || p.model,
      label: p.label,
    };
  }

  // 3) 自动探测：国产优先
  for (const id of PROBE_ORDER) {
    const p = LLM_PRESETS[id];
    const key = process.env[p.keyEnv]?.trim();
    if (!key) continue;
    return {
      provider: p.id,
      baseUrl: base || p.baseUrl,
      apiKey: key,
      model: modelOverride || p.model,
      label: p.label,
    };
  }

  // 4) 历史配置兜底：只给了 LLM_API_KEY 但没给 base
  if (genericKey) {
    return {
      provider: "deepseek",
      baseUrl: LLM_PRESETS.deepseek.baseUrl,
      apiKey: genericKey,
      model: modelOverride || LLM_PRESETS.deepseek.model,
      label: LLM_PRESETS.deepseek.label,
    };
  }

  return null;
}

export type LlmChatArgs = {
  system: string;
  /** 对话历史，最后一条应为 user */
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

/**
 * 调用 OpenAI 兼容的大模型，返回生成的文本。
 * 未配置密钥 / 请求失败 / 超时，一律返回 null —— 调用方应有规则兜底。
 */
export async function llmChat(args: LlmChatArgs): Promise<string | null> {
  const cfg = getLlmConfig();
  if (!cfg) return null;

  const {
    system,
    messages,
    temperature = 0.5,
    maxTokens = 500,
    timeoutMs = 20000,
  } = args;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "system", content: system }, ...messages],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      // 只在服务端日志留痕，不向用户暴露厂商细节
      console.warn(`[llm] ${cfg.provider} 返回 ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch (e) {
    console.warn(
      `[llm] ${cfg.provider} 调用失败：`,
      e instanceof Error ? e.message : String(e)
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 供后台/自检展示：只暴露厂商名与型号，绝不返回密钥 */
export function llmPublicStatus() {
  const cfg = getLlmConfig();
  if (!cfg) {
    return {
      configured: false as const,
      note: "未配置任何大模型密钥，AI 客服将使用规则引擎与知识库兜底。",
    };
  }
  return {
    configured: true as const,
    provider: cfg.provider,
    label: cfg.label,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
  };
}
