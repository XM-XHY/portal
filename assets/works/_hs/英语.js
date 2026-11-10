/**
 * 高中·英语 题库数据源（人教版 2019）
 * 由 scripts/patch-quanke-hs.mjs 内联进 assets/works/quanke.html
 */
module.exports = {
  人教版: {
    bank: {
      "高中·时态与语态": {
        基础: { q: "He ______ (go) to school every day.", a: "goes", h: "一般现在时，主语第三人称单数，动词加 -es" },
        变式: { q: "I ______ (see) him in the library yesterday.", a: "saw", h: "yesterday 是明确过去时间标志，用一般过去时" },
        拔高: { q: "By the time he arrived, the film ______ (begin).", a: "had begun", h: "「过去的过去」用过去完成时：had + 过去分词" }
      },
      "高中·定语从句": {
        基础: { q: "The man ______ is standing there is my teacher.", a: "who / that", h: "先行词是人且在从句中作主语，用 who 或 that" },
        变式: { q: "This is the house ______ I lived in last year.", a: "which / that", h: "先行词是物且作介词 in 的宾语，用 which/that，也可省略" },
        拔高: { q: "He failed the exam, ______ made his parents angry.", a: "which", h: "非限制性定语从句指代整个主句，只能用 which，不能用 that" }
      },
      "高中·名词性从句": {
        基础: { q: "______ he said at the meeting is true.", a: "What", h: "主语从句缺宾语，指「说的内容」用 what（= the thing that）" },
        变式: { q: "I don't know ______ he will come or not.", a: "whether", h: "与 or not 直接连用时只能用 whether，不能用 if" },
        拔高: { q: "______ we will hold the sports meeting depends on the weather.", a: "Whether", h: "主语从句置于句首表「是否」，用 whether" }
      },
      "高中·状语从句": {
        基础: { q: "______ it rains tomorrow, we will stay at home.", a: "If", h: "条件状语从句，主将从现" },
        变式: { q: "He works ______ hard ______ he always gets good grades.", a: "so ... that", h: "so + 形容词/副词 + that 引导结果状语从句" },
        拔高: { q: "______ hard he tried, he couldn't solve the problem.", a: "However", h: "however + 形容词/副词 + 主语 + 谓语，让步状语从句的倒装结构" }
      },
      "高中·非谓语动词·不定式与动名词": {
        基础: { q: "I want ______ (go) home now.", a: "to go", h: "want to do sth 固定搭配，后接不定式" },
        变式: { q: "He enjoys ______ (read) novels in his spare time.", a: "reading", h: "enjoy doing sth，只接动名词" },
        拔高: { q: "Remember ______ (lock) the door when you leave.（表示「记得要去锁」）", a: "to lock", h: "remember to do 记得要做（未做）；remember doing 记得做过（已做）" }
      },
      "高中·非谓语动词·分词": {
        基础: { q: "______ (see) from the top of the hill, the city looks beautiful.", a: "Seen", h: "city 与 see 是被动关系，用过去分词作状语" },
        变式: { q: "The boy ______ (play) football on the playground is my brother.", a: "playing", h: "boy 与 play 是主动关系且正在进行，用现在分词作后置定语" },
        拔高: { q: "______ (finish) his homework, he went out to play.", a: "Having finished", h: "动作发生在主句谓语之前且主动，用现在分词的完成式" }
      },
      "高中·虚拟语气": {
        基础: { q: "If I ______ you, I would study harder.", a: "were", h: "与现在事实相反，从句用过去式；be 动词一律用 were" },
        变式: { q: "I wish I ______ (know) the answer now.", a: "knew", h: "wish 后与现在事实相反，用一般过去时" },
        拔高: { q: "If he ______ (leave) earlier, he would have caught the train.", a: "had left", h: "与过去事实相反，从句用 had + 过去分词，主句用 would have done" }
      },
      "高中·倒装与强调": {
        基础: { q: "Never ______ I seen such a beautiful place before.", a: "have", h: "否定词置于句首引起部分倒装：Never have I seen..." },
        变式: { q: "It was in 2008 ______ the Olympic Games were held in Beijing.", a: "that", h: "强调句型 It is/was ... that ...，强调时间状语" },
        拔高: { q: "Only when he came back ______ he realize the truth.", a: "did", h: "Only + 状语从句置于句首，主句部分倒装，用助动词 did" }
      },
      "高中·主谓一致": {
        基础: { q: "The number of students in our school ______ (be) increasing.", a: "is", h: "the number of + 复数名词，中心词是 number，谓语用单数" },
        变式: { q: "A number of students ______ (be) playing on the playground.", a: "are", h: "a number of = 许多，谓语用复数；与 the number of 区分" },
        拔高: { q: "Either you or he ______ (be) right.", a: "is", h: "either...or 连接主语时遵循就近原则，靠近 he 用 is" }
      },
      "高中·介词与连词": {
        基础: { q: "He is good ______ playing chess.", a: "at", h: "be good at doing sth 擅长做某事" },
        变式: { q: "______ the heavy rain, we still went out.", a: "Despite", h: "despite/in spite of 是介词，后接名词短语；although 后接句子" },
        拔高: { q: "______ he is young, he knows a lot.", a: "Although / Though", h: "让步状语从句，注意 although 不能与 but 连用" }
      },
      "高中·词汇与构词法": {
        基础: { q: "写出 happy 的反义词", a: "unhappy", h: "前缀 un- 表否定" },
        变式: { q: "写出动词 create 的名词形式", a: "creation", h: "动词 + -tion 变名词，注意拼写去掉 e" },
        拔高: { q: "后缀 -less 表示什么含义，举一例", a: "表示「无、没有」，如 hopeless（无望的）、careless（粗心的）", h: "-less 是常见否定后缀，与 -ful 相对" }
      },
      "高中·完形填空技巧": {
        基础: { q: "做完形填空最主要的依据是什么", a: "上下文语境（而非单个句子的意思）", h: "完形考的是语篇理解，必须前后照应" },
        变式: { q: "完形中遇到生词应该怎么办", a: "根据上下文推测词义，不要停留纠结", h: "生词往往不影响解题，先跳过保持阅读节奏" },
        拔高: { q: "完形填空中常见的转折标志词有哪些", a: "but、however、yet、although、instead、on the contrary", h: "抓住这些词能快速判断语义走向" }
      },
      "高中·阅读理解技巧": {
        基础: { q: "主旨大意题的答案通常出现在文章的什么位置", a: "首段或末段（以及各段首句）", h: "英文说明文、议论文多为「总—分—总」结构" },
        变式: { q: "细节理解题的正确做法是什么", a: "回原文定位对应的句子，逐词比对", h: "不能凭印象或常识作答" },
        拔高: { q: "推理判断题不应该选哪类选项", a: "原文直接陈述的内容（那不是推理）", h: "正确选项应是「基于原文可推出但未明说」" }
      },
      "高中·书面表达": {
        基础: { q: "英语书信的常用开头称呼是什么", a: "Dear ... ,", h: "正式书信可用 Dear Mr. Smith,；结尾用 Yours sincerely," },
        变式: { q: "议论文常用的逻辑连接词有哪些", a: "Firstly / Moreover / Furthermore / In conclusion", h: "连接词使文章层次清晰，是评分要点之一" },
        拔高: { q: "应用文写作的三个评分重点是什么", a: "内容要点齐全、语言准确得体、格式规范", h: "漏要点是失分主因，语言以准确为先，不追求生僻词" }
      },
      "高中·读后续写": {
        基础: { q: "读后续写的第一步应该做什么", a: "读懂原文，把握人物性格、情节走向和主题", h: "续写必须与原文逻辑自洽" },
        变式: { q: "续写时要注意与原文保持哪三方面一致", a: "情节逻辑、人物形象、时态与人称", h: "原文用第一人称过去时，续写也要保持" },
        拔高: { q: "读后续写拿高分的关键是什么", a: "生动的细节描写（动作、心理、环境）＋与原文主题呼应", h: "避免只推进情节的「流水账」" }
      }
    },
    vmx: {
      "高中·时态与语态": "高一上",
      "高中·定语从句": "高一上",
      "高中·名词性从句": "高一下",
      "高中·状语从句": "高一下",
      "高中·非谓语动词·不定式与动名词": "高二上",
      "高中·非谓语动词·分词": "高二上",
      "高中·虚拟语气": "高二下",
      "高中·倒装与强调": "高二下",
      "高中·主谓一致": "高一下",
      "高中·介词与连词": "高一上",
      "高中·词汇与构词法": "高一上",
      "高中·完形填空技巧": "高二上",
      "高中·阅读理解技巧": "高二上",
      "高中·书面表达": "高三",
      "高中·读后续写": "高三"
    }
  }
};
