import { notFound } from "next/navigation";
import { getShareSnapshot } from "@/lib/schedule";
import ScheduleShareView from "@/components/ScheduleShareView";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: { token: string } }) {
  const state = await getShareSnapshot(params.token);
  if (!state) notFound();

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">🗓️ 学校课表（只读分享）</h1>
            <p className="mt-1 text-sm text-slate-400">该链接为只读，由教务管理员生成并分享。</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
            生成于 {new Date(state.updatedAt).toLocaleString("zh-CN")}
          </span>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] p-6">
          <ScheduleShareView state={state} token={params.token} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          如需修改课表，请联系学校教务管理员。
        </p>
      </div>
    </main>
  );
}
