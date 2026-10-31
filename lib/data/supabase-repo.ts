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

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: false } });
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
  async getSearchLogs(): Promise<SearchLog[]> {
    const { data } = await this.sb
      .from("search_logs")
      .select("*")
      .order("at", { ascending: false })
      .limit(500);
    return (data || []).map((d: any) => ({ q: d.q, at: d.at, ip: d.ip }));
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

  async saveContents(items: ContentItem[]): Promise<ContentItem[]> {
    const rows = items.map(toContentRow);
    if (rows.length) {
      await this.sb.from("contents").upsert(rows, { onConflict: "id" });
    }
    const ids = items.map((i) => i.id);
    if (ids.length === 0) {
      await this.sb.from("contents").delete().neq("id", "__impossible__");
    } else {
      const list = `(${ids.map((id) => `"${id}"`).join(",")})`;
      await this.sb.from("contents").delete().not("id", "in", list);
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
  return { id: d.id, username: d.username, role: d.role, pwHash: d.pw_hash };
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
