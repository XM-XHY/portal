import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hash } from "./hash";
import { defaultSite, defaultAdmins, defaultContents } from "./defaults";
import type {
  Repo,
  SiteInfo,
  Admin,
  Lead,
  ContentItem,
  ContentType,
  SearchLog,
  AuditLog,
  AuditInput,
} from "./types";

/**
 * Supabase 实现（生产 / Serverless 推荐）。
 * 使用 SERVICE_ROLE_KEY 在服务端直连，绕过 RLS；该密钥只在服务端环境变量，绝不暴露给浏览器。
 * 表结构见 supabase/schema.sql。未配置 Supabase 环境变量时，index.ts 会自动回退到 JsonRepo。
 */
export class SupabaseRepo implements Repo {
  private sb: SupabaseClient;
  private seedChecked = false;

  /**
   * @param fetchImpl 可选的底层 fetch 覆盖。接国产 CloudBase PG 时传入
   *   `createCloudBasePgFetch()`，把 supabase-js 的 `/rest/v1/...` 重写到国产网关；
   *   不传则走原来的 Supabase 直连。仓储层其余代码两种模式完全共用。
   */
  constructor(url: string, key: string, fetchImpl?: (input: any, init?: any) => Promise<Response>) {
    this.sb = createClient(url, key, {
      auth: { persistSession: false },
      // 关键：Next.js 14 默认对服务端 fetch 开启 Data Cache（force-cache），
      // 会把读请求结果缓存住，导致后台改完数据、前台仍读到旧值
      // （表现为"保存失败"）。两种模式都必须强制不走缓存。
      global: {
        fetch: fetchImpl
          ? fetchImpl
          : (input: any, init: any) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }

  private async ensureSeed() {
    if (this.seedChecked) return;
    this.seedChecked = true;
    try {
      const { count } = await this.sb
        .from("admins")
        .select("*", { count: "exact", head: true });
      if (!count) {
        await this.sb.from("admins").upsert(defaultAdmins(), { onConflict: "id" });
      }
      const { count: sc } = await this.sb
        .from("site_info")
        .select("*", { count: "exact", head: true });
      if (!sc) {
        const s = defaultSite();
        await this.sb.from("site_info").upsert({ id: 1, ...toSiteRow(s) }, { onConflict: "id" });
      }
      const { count: cc } = await this.sb
        .from("contents")
        .select("*", { count: "exact", head: true });
      if (!cc) {
        await this.sb.from("contents").upsert(defaultContents().map(toContentRow), { onConflict: "id" });
      }
    } catch {
      // 网络/权限异常不阻断主流程，后续按"查不到"处理
    }
  }

  // ---------- 站点信息 ----------
  async getSite(): Promise<SiteInfo> {
    try {
      const { data } = await this.sb
        .from("site_info")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (data) return fromSiteRow(data);
      return defaultSite();
    } catch (e) {
      // Supabase 不可达时降级为默认值，保证官网首页不 500
      console.error("[supabase] getSite 失败，降级默认值:", (e as Error)?.message);
      return defaultSite();
    }
  }

  async updateSite(patch: Partial<SiteInfo>): Promise<SiteInfo> {
    const row = toSiteRow(patch as SiteInfo);
    const { data, error } = await this.sb
      .from("site_info")
      .upsert({ id: 1, ...row, updated_at: new Date().toISOString() }, { onConflict: "id" })
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "更新站点信息失败");
    return fromSiteRow(data);
  }

  // ---------- 管理员 ----------
  async getAdmins(): Promise<Admin[]> {
    await this.ensureSeed();
    const { data } = await this.sb.from("admins").select("*");
    return (data || []).map(fromAdminRow);
  }

  async setAdminPassword(id: string, newPw: string): Promise<boolean> {
    const { data, error } = await this.sb
      .from("admins")
      .update({ pw_hash: hash(newPw) })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return false;
    return true;
  }

  async setAdminRole(id: string, role: Admin["role"]): Promise<boolean> {
    const { data, error } = await this.sb
      .from("admins")
      .update({ role })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return false;
    return true;
  }

  async addAdmin(input: {
    username: string;
    password: string;
    role: Admin["role"];
    perms?: string[];
  }): Promise<Admin> {
    const admins = await this.getAdmins();
    const username = input.username.trim();
    if (admins.some((a) => a.username === username)) {
      throw new Error("用户名已存在");
    }
    const base = {
      id: `a_${crypto.randomUUID().slice(0, 8)}`,
      username,
      role: input.role,
      pw_hash: hash(input.password),
    };
    const row = { ...base, perms: input.perms ?? null };
    try {
      const { data, error } = await this.sb.from("admins").insert(row).select().single();
      if (error) throw error;
      return fromAdminRow(data);
    } catch (e: any) {
      // 兼容尚未执行迁移脚本（无 perms 列）的旧表：去掉 perms 重试，权限按角色默认生效
      if (missingColumn(e)) {
        const { data, error } = await this.sb.from("admins").insert(base).select().single();
        if (error || !data) throw new Error(error?.message || "创建账号失败");
        return fromAdminRow(data);
      }
      throw new Error(e?.message || "创建账号失败");
    }
  }

  async setAdminPerms(id: string, perms: string[] | null): Promise<boolean> {
    try {
      const { data, error } = await this.sb
        .from("admins")
        .update({ perms: perms === null ? null : perms })
        .eq("id", id)
        .select()
        .single();
      if (error || !data) return false;
      return true;
    } catch (e: any) {
      // 迁移未执行时 perms 列不存在：逐账号权限暂不可用，但角色默认权限仍生效
      if (missingColumn(e)) return false;
      return false;
    }
  }

  async removeAdmin(id: string): Promise<boolean> {
    const { data, error } = await this.sb
      .from("admins")
      .delete()
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return false;
    return true;
  }

  // ---------- 线索 ----------
  async addLead(input: Omit<Lead, "id" | "at" | "status">): Promise<Lead> {
    const { data, error } = await this.sb
      .from("leads")
      .insert({
        name: input.name,
        phone: input.phone,
        company: input.company,
        query: input.query,
        status: "new",
      })
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "提交线索失败");
    return fromLeadRow(data);
  }

  async getLeads(): Promise<Lead[]> {
    const { data } = await this.sb.from("leads").select("*").order("at", { ascending: false });
    return (data || []).map(fromLeadRow);
  }

  async updateLead(
    id: string,
    patch: Partial<Pick<Lead, "status" | "note">>
  ): Promise<Lead | null> {
    const { data, error } = await this.sb
      .from("leads")
      .update({ status: patch.status, note: patch.note })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return null;
    return fromLeadRow(data);
  }

  // ---------- 搜索日志 ----------
  /**
   * 看板统计依赖全量日志，原来 `.limit(500)` 会让「累计搜索 / 热词 / 转化率」
   * 只反映最近 500 条。这里分页拉全量（Supabase 单次上限 1000 行），
   * 并设 20 万条硬上限防止异常数据量拖垮请求。
   */
  async getSearchLogs(): Promise<SearchLog[]> {
    const all: SearchLog[] = [];
    const PAGE = 1000;
    for (let from = 0; from <= 200000; from += PAGE) {
      const { data, error } = await this.sb
        .from("search_logs")
        .select("*")
        .order("at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) break;
      const rows = data || [];
      for (const d of rows) all.push({ q: d.q, at: d.at, ip: d.ip });
      if (rows.length < PAGE) break;
    }
    return all;
  }

  async addSearchLog(q: string, ip: string): Promise<void> {
    await this.sb.from("search_logs").insert({ q, ip });
  }

  // ---------- 内容（资讯/产品/案例）----------
  async getContents(type?: ContentType): Promise<ContentItem[]> {
    try {
      let q = this.sb.from("contents").select("*");
      if (type) q = q.eq("type", type);
      const { data } = await q.order("order", { ascending: true });
      const list = (data || []).map(fromContentRow);
      // 表不存在或为空时退回内置种子，保证前台产品/案例/资讯区块不空白
      return list.length ? list : defaultContents().filter((c) => !type || c.type === type);
    } catch (e) {
      console.error("[supabase] getContents 失败，降级种子数据:", (e as Error)?.message);
      return defaultContents().filter((c) => !type || c.type === type);
    }
  }

  async getContent(id: string): Promise<ContentItem | null> {
    const { data } = await this.sb.from("contents").select("*").eq("id", id).maybeSingle();
    return data ? fromContentRow(data) : null;
  }

  /** 仅 upsert 传入条目，绝不删除其他行（见 Repo 接口注释） */
  async saveContents(items: ContentItem[]): Promise<ContentItem[]> {
    const rows = items.map(toContentRow);
    if (rows.length) {
      const { error } = await this.sb.from("contents").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`contents 写入失败: ${error.message} (code=${error.code})`);
    }
    return items;
  }

  /** 按 id 精确删除 */
  async deleteContents(ids: string[]): Promise<void> {
    const list = ids.filter(Boolean);
    if (!list.length) return;
    const CHUNK = 200;
    for (let i = 0; i < list.length; i += CHUNK) {
      const { error } = await this.sb.from("contents").delete().in("id", list.slice(i, i + CHUNK));
      if (error) throw new Error(`contents 删除失败: ${error.message} (code=${error.code})`);
    }
  }

  /** 整体替换：upsert 后删除未出现在列表中的行（仅后台全量保存/删除条目时使用） */
  async replaceContents(items: ContentItem[]): Promise<ContentItem[]> {
    await this.saveContents(items);
    const ids = items.map((i) => i.id);
    if (ids.length === 0) {
      await this.sb.from("contents").delete().neq("id", "__impossible__");
      return items;
    }
    // 分批构造 NOT IN 条件，避免 URL 过长
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      const list = `(${part.map((id) => `"${id}"`).join(",")})`;
      const { error } = await this.sb.from("contents").delete().not("id", "in", list);
      if (error) throw new Error(`contents 清理失败: ${error.message} (code=${error.code})`);
    }
    return items;
  }

  // ---------- 审计 ----------
  async getAuditLogs(): Promise<AuditLog[]> {
    const { data } = await this.sb
      .from("audit_logs")
      .select("*")
      .order("at", { ascending: false })
      .limit(1000);
    return (data || []).map((d: any) => ({
      id: String(d.id),
      at: d.at,
      actor: d.actor,
      action: d.action,
      target: d.target,
      ip: d.ip,
      detail: d.detail,
    }));
  }

  async appendAudit(input: AuditInput): Promise<void> {
    await this.sb.from("audit_logs").insert({
      actor: input.actor,
      action: input.action,
      target: input.target,
      ip: input.ip,
      detail: input.detail || "",
    });
  }

  newId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
}

// ---------- 兼容辅助 ----------

/** 判断错误是否因 admins 表缺少 perms 列（迁移脚本尚未执行）。
 * 此时权限按角色默认生效，逐账号覆盖暂不可用，但不阻断主流程。 */
function missingColumn(e: any): boolean {
  const m = e?.message || e?.error_description || "";
  return (
    e?.code === "42703" ||
    /column .*perms.*does not exist|relation .*admins.*does not exist/i.test(m)
  );
}

// ---------- 行映射 ----------
function toSiteRow(s: SiteInfo) {
  return {
    company_name: s.companyName,
    slogan: s.slogan,
    contact_name: s.contactName,
    phone: s.phone,
    email: s.email,
    address: s.address,
    icp: s.icp,
  };
}
function fromSiteRow(d: any): SiteInfo {
  return {
    companyName: d.company_name,
    slogan: d.slogan,
    contactName: d.contact_name,
    phone: d.phone,
    email: d.email,
    address: d.address,
    icp: d.icp,
  };
}
function fromAdminRow(d: any): Admin {
  return {
    id: d.id,
    username: d.username,
    role: d.role,
    pwHash: d.pw_hash,
    perms: Array.isArray(d.perms) ? (d.perms as string[]) : undefined,
  };
}
function fromLeadRow(d: any): Lead {
  return {
    id: d.id,
    name: d.name,
    phone: d.phone,
    company: d.company,
    query: d.query,
    at: d.at,
    status: d.status,
    note: d.note,
  };
}
function toContentRow(n: ContentItem) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    tag: n.tag,
    summary: n.summary,
    body: n.body,
    icon: n.icon,
    tags: n.tags,
    client: n.client,
    industry: n.industry,
    result: n.result,
    at: n.at,
    order: n.order,
  };
}
function fromContentRow(d: any): ContentItem {
  return {
    id: d.id,
    type: d.type || "news",
    title: d.title,
    tag: d.tag,
    summary: d.summary,
    body: d.body || "",
    icon: d.icon || "📄",
    tags: Array.isArray(d.tags) ? d.tags : [],
    client: d.client || "",
    industry: d.industry || "",
    result: d.result || "",
    at: d.at || "",
    order: d.order || 0,
  };
}
