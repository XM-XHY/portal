import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { getWork } from "@/lib/works";
import WorkPlayer from "@/components/WorkPlayer";

// 作品清单随发布变化，走动态渲染即可；layout 已声明 force-dynamic，
// 这里不再写 generateStaticParams（两者同时存在会互相冲突）。
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export function generateMetadata({ params }: Params): Metadata {
  const work = getWork(params.id);
  if (!work) {
    return pageMeta({
      title: "作品不存在",
      description: "该作品不存在或已下线。",
      path: `/works/${params.id}`,
      noIndex: true,
    });
  }
  return pageMeta({
    title: `${work.name} · 在线体验`,
    description: work.summary,
    path: `/works/${work.id}`,
    keywords: work.tags,
    // 页面主体是 iframe 里的单文件应用，本身没有可被索引的文本，
    // 收录它只会和 /works 争夺关键词，因此不索引。
    noIndex: true,
  });
}

export default function WorkPlayPage({ params }: Params) {
  const work = getWork(params.id);
  if (!work) notFound();

  // 只把展示需要的最小字段传给客户端组件，不把整个作品清单序列化进页面
  return (
    <WorkPlayer
      id={work.id}
      name={work.name}
      subtitle={work.subtitle}
      accessNote={work.accessNote}
    />
  );
}
