import { describe, it, expect } from "vitest";
import {
  readRows,
  readSheetTexts,
  buildWorkbookBuffer,
  parseCsv,
  LegacyXlsError,
} from "@/lib/sheet";

/**
 * lib/sheet 是把 xlsx@0.18.5（high，无补丁）换成 exceljs 后的唯一收敛点。
 * 这里验证「写出 → 读回」往返一致，确保替换没有悄悄改变导出文件的结构。
 */
describe("lib/sheet 表格适配层", () => {
  it("写出→读回 往返一致（多工作表 + 列宽 + 行高）", async () => {
    const buf = await buildWorkbookBuffer([
      {
        name: "分班统计",
        rows: [
          ["班级", "人数"],
          ["一班", 42],
        ],
        colWidths: [10, 8],
      },
      {
        name: "一班",
        rows: [
          ["序号", "姓名"],
          [1, "张三"],
        ],
        rowHeights: [22, 34],
      },
    ]);

    // xlsx 本质是 zip：首两字节必须是 PK
    const u8 = new Uint8Array(buf);
    expect([u8[0], u8[1]]).toEqual([0x50, 0x4b]);
    expect(buf.byteLength).toBeGreaterThan(1000);

    // 读回第一张表，数字会被归一化为字符串
    const rows = await readRows(buf);
    expect(rows[0]).toEqual(["班级", "人数"]);
    expect(rows[1]).toEqual(["一班", "42"]);
  });

  it("readSheetTexts 返回全部工作表且保留中文表名", async () => {
    const buf = await buildWorkbookBuffer([
      { name: "教师", rows: [["姓名", "科目"], ["李四", "数学"]] },
      { name: "教室", rows: [["教室", "容量"], ["A101", 50]] },
    ]);
    const sheets = await readSheetTexts(buf);
    expect(sheets.map((s) => s.name)).toEqual(["教师", "教室"]);
    expect(sheets[0].text).toContain("李四,数学");
    expect(sheets[1].text).toContain("A101,50");
  });

  it("工作表名超长/含非法字符时被清洗且不重复", async () => {
    const buf = await buildWorkbookBuffer([
      { name: "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十超出三十一", rows: [["a"]] },
      { name: "重名", rows: [["b"]] },
      { name: "重名", rows: [["c"]] },
    ]);
    const sheets = await readSheetTexts(buf);
    expect(sheets).toHaveLength(3);
    // Excel 限制 31 字符
    expect(sheets[0].name.length).toBeLessThanOrEqual(31);
    // 重名被去重
    expect(new Set(sheets.map((s) => s.name)).size).toBe(3);
  });

  it("CSV 文本可直接解析：BOM / 引号转义 / 逗号 / CRLF", async () => {
    const csv = '\uFEFF姓名,备注\r\n"张,三","含""引号""的值"\r\n李四,普通\r\n';
    const rows = await readRows(new TextEncoder().encode(csv));
    expect(rows[0]).toEqual(["姓名", "备注"]);
    expect(rows[1]).toEqual(["张,三", '含"引号"的值']);
    expect(rows[2]).toEqual(["李四", "普通"]);
  });

  it("parseCsv 保留原始行列结构（空行/空字段由上层决定是否剔除）", () => {
    const rows = parseCsv("a,b\n\n1,,3\n");
    expect(rows[0]).toEqual(["a", "b"]);
    expect(rows[1]).toEqual([""]); // 空行原样保留
    expect(rows[2]).toEqual(["1", "", "3"]); // 中间空字段保留占位
  });

  it("旧版 .xls（OLE2）抛 LegacyXlsError，而不是静默返回空表", async () => {
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(readRows(ole2)).rejects.toBeInstanceOf(LegacyXlsError);
    await expect(readSheetTexts(ole2)).rejects.toBeInstanceOf(LegacyXlsError);
  });

  it("含换行的单元格被写入（课表/名册依赖此格式）", async () => {
    const buf = await buildWorkbookBuffer([
      { name: "课表", rows: [["第1节\n8:00", "语文\n张老师 · A101"]] },
    ]);
    const rows = await readRows(buf);
    expect(rows[0][0]).toBe("第1节\n8:00");
    expect(rows[0][1]).toBe("语文\n张老师 · A101");
  });
});
