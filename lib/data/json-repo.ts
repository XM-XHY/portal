import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
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

// 数据目录：可用 DATA_DIR 覆盖。Serverless（Vercel 等）建议设为 /tmp，
// 但注意 /tmp 按实例隔离、重启即失；生产应使用 Supabase（配置 SUPABASE_URL 即自动切换）。
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

// 行内类型，仅用于本地文件结构
type JsonDb = {
  site: SiteInfo;
  admins: Admin[];
  leads: Lead[];
  contents: ContentItem[];
  searchLogs: SearchLog[];
  auditLogs: AuditLog[];
};

function defaultDb(): JsonDb {
  return {
    site: defaultSite(),
    admins: defaultAdmins(),
    leads: [],
    contents: defaultContents(),
    searchLogs: [],
    auditLogs: [],
  };
}

/** 兼容旧版 { news: [...] } 结构，自动扁平化为统一内容数组 */
function migrateContents(raw: any): ContentItem[] {
  if (Array.isArray(raw)) return raw as ContentItem[];
  if (raw && Array.isArray(raw.news)) {
    return raw.news.map((n: any) => ({ ...n, type: "news", body: "", icon: "📄", tags: [], client: "", industry: "", result: "", at: n.at || "", order: 0 }));
  }
  return [];
}

export class JsonRepo implements Repo {
  private cache: JsonDb | null = null;
  private writeWarned = false;

  private async read(): Promise<JsonDb> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(DB_PATH, "utf8");
      const parsed = JSON.parse(raw) as JsonDb;
      if (!Array.isArray(parsed.contents)) {
        parsed.contents = migrateContents(parsed.contents);
      }
      this.cache = parsed;
    } catch {
      this.cache = defaultDb();
      await this.write(this.cache);
    }
    return this.cache!;
  }

  /**
   * 写入数据文件。Serverless 环境（Vercel）文件系统只读，写入会 EACCES；
   * 此时仅保留内存缓存并告警，保证页面不 500（生产请配置 Supabase 或 DATA_DIR=/tmp）。
   */
  private async write(db: JsonDb): Promise<void> {
    this.cache = db;
    try {
      await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
      await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
    } catch (e) {
      if (!this.writeWarned) {
        this.writeWarned = true;
        console.warn(
          `[json-repo] 写入数据文件失败（${(e as Error)?.message}）。` +
            "当前仅在内存中生效，重启即丢失。生产环境请配置 Supabase，或设置 DATA_DIR=/tmp。"
        );
      }
    }
  }

  async getSite(): Promise<SiteInfo> {
    return (await this.read()).site;
  }

  async updateSite(patch: Partial<SiteInfo>): Promise<SiteInfo> {
    const db = await this.read();
    db.site = { ...db.site, ...patch };
    await this.write(db);
    return db.site;
  }

  async getAdmins(): Promise<Admin[]> {
    return (await this.read()).admins;
  }

  async setAdminPassword(id: string, newPw: string): Promise<boolean> {
    const db = await this.read();
    const admin = db.admins.find((a) => a.id === id);
    if (!admin) return false;
    admin.pwHash = hash(newPw);
    await this.write(db);
    return true;
  }

  async addAdmin(input: {
    username: string;
    password: string;
    role: Admin["role"];
  }): Promise<Admin> {
    const db = await this.read();
    const username = input.username.trim();
    if (db.admins.some((a) => a.username === username)) {
      throw new Error("用户名已存在");
    }
    const admin: Admin = {
      id: `a_${crypto.randomUUID().slice(0, 8)}`,
      username,
      role: input.role,
      pwHash: hash(input.password),
    };
    db.admins.push(admin);
    await this.write(db);
    return admin;
  }

  async removeAdmin(id: string): Promise<boolean> {
    const db = await this.read();
    const before = db.admins.length;
    db.admins = db.admins.filter((a) => a.id !== id);
    if (db.admins.length === before) return false;
    await this.write(db);
    return true;
  }

  async addLead(input: Omit<Lead, "id" | "at" | "status">): Promise<Lead> {
    const db = await this.read();
    const lead: Lead = {
      ...input,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      status: "new",
    };
    db.leads.unshift(lead);
    await this.write(db);
    return lead;
  }

  async getLeads(): Promise<Lead[]> {
    return (await this.read()).leads;
  }

  async updateLead(
    id: string,
    patch: Partial<Pick<Lead, "status" | "note">>
  ): Promise<Lead | null> {
    const db = await this.read();
    const lead = db.leads.find((l) => l.id === id);
    if (!lead) return null;
    Object.assign(lead, patch);
    await this.write(db);
    return lead;
  }

  async getSearchLogs(): Promise<SearchLog[]> {
    return (await this.read()).searchLogs;
  }

  async addSearchLog(q: string, ip: string): Promise<void> {
    const db = await this.read();
    db.searchLogs.unshift({ q, at: new Date().toISOString(), ip });
    if (db.searchLogs.length > 500) db.searchLogs.length = 500;
    await this.write(db);
  }

  async getContents(type?: ContentType): Promise<ContentItem[]> {
    const all = (await this.read()).contents;
    const list = type ? all.filter((c) => c.type === type) : all;
    return [...list].sort((a, b) => a.order - b.order);
  }

  async getContent(id: string): Promise<ContentItem | null> {
    return (await this.read()).contents.find((c) => c.id === id) || null;
  }

  async saveContents(items: ContentItem[]): Promise<ContentItem[]> {
    const db = await this.read();
    db.contents = items;
    await this.write(db);
    return db.contents;
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return (await this.read()).auditLogs;
  }

  async appendAudit(input: AuditInput): Promise<void> {
    const db = await this.read();
    db.auditLogs.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      ...input,
    });
    if (db.auditLogs.length > 1000) db.auditLogs.length = 1000;
    await this.write(db);
  }

  newId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
}
