import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import {
  Brain, BarChart3, FileText, Code2, Search,
  Sun, Moon, ArrowRight, ArrowUpRight, Sparkles, Zap, Shield, Heart, MessageSquare,
} from 'lucide-react'
import Logo from '@/components/Logo'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'

const features = [
  {
    icon: MessageSquare,
    title: '智能对话',
    desc: '多 Agent 协作架构，自动识别意图并路由到最合适的专业 Agent',
    gradient: 'from-sky-400 to-blue-600',
  },
  {
    icon: Brain,
    title: '身心健康',
    desc: '心理测评、健康日记、情绪趋势分析，温暖陪伴每一天',
    gradient: 'from-rose-400 to-pink-600',
  },
  {
    icon: BarChart3,
    title: '数据分析',
    desc: 'CSV/Excel 智能分析，自动生成可视化图表和分析报告',
    gradient: 'from-emerald-400 to-teal-600',
  },
  {
    icon: FileText,
    title: '文档处理',
    desc: 'PDF、Word、PPTX 生成与转换，排版精美开箱即用',
    gradient: 'from-amber-400 to-orange-600',
  },
  {
    icon: Code2,
    title: '应用开发',
    desc: '在对话中构建完整 Web 应用，从想法到上线一步到位',
    gradient: 'from-violet-400 to-purple-600',
  },
  {
    icon: Search,
    title: '知识检索',
    desc: 'RAG 知识库驱动，基于专业资料给出准确可靠的回答',
    gradient: 'from-cyan-400 to-teal-500',
  },
]

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true) },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeStore()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [mounted, setMounted] = useState(false)
  const [showNote, setShowNote] = useState(false)

  const feat = useScrollReveal()
  const cta = useScrollReveal()

  useEffect(() => {
    if (isAuthenticated) navigate('/chat', { replace: true })
  }, [isAuthenticated])

  useEffect(() => { setMounted(true) }, [])

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a24] text-gray-900 dark:text-gray-100 overflow-hidden">
      <style>{`
        .fd{font-family:'Outfit',system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif}
        .hero-mesh{
          background:
            radial-gradient(ellipse 80% 50% at 50% -20%,rgba(14,165,233,.12),transparent),
            radial-gradient(ellipse 60% 40% at 80% 50%,rgba(168,85,247,.08),transparent),
            radial-gradient(ellipse 50% 60% at 10% 80%,rgba(14,165,233,.06),transparent);
        }
        .dark .hero-mesh{
          background:
            radial-gradient(ellipse 80% 50% at 50% -20%,rgba(14,165,233,.15),transparent),
            radial-gradient(ellipse 60% 40% at 80% 50%,rgba(168,85,247,.10),transparent),
            radial-gradient(ellipse 50% 60% at 10% 80%,rgba(14,165,233,.08),transparent);
        }
        .dot-grid{
          background-image:radial-gradient(rgba(0,0,0,.05) 1px,transparent 1px);
          background-size:24px 24px;
        }
        .dark .dot-grid{
          background-image:radial-gradient(rgba(255,255,255,.035) 1px,transparent 1px);
        }
        @keyframes gshift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        .anim-grad{background-size:200% auto;animation:gshift 6s ease infinite}
        @keyframes fup{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fup .8s cubic-bezier(.16,1,.3,1) forwards;opacity:0}
        .d1{animation-delay:.1s}.d2{animation-delay:.2s}.d3{animation-delay:.3s}
        .d4{animation-delay:.4s}.d5{animation-delay:.5s}.d6{animation-delay:.6s}.d7{animation-delay:.7s}
        .fc{transition:all .35s cubic-bezier(.4,0,.2,1)}
        .fc:hover{transform:translateY(-3px)}
        .fc:hover .fi{transform:scale(1.12)}
        .fi{transition:transform .35s cubic-bezier(.4,0,.2,1)}
        .glow{box-shadow:0 0 60px -12px rgba(14,165,233,.2),0 0 30px -8px rgba(168,85,247,.15)}
        .dark .glow{box-shadow:0 0 80px -12px rgba(14,165,233,.3),0 0 40px -8px rgba(168,85,247,.2)}
        @keyframes fslow{0%,100%{transform:translateY(0) rotate(0deg)}33%{transform:translateY(-8px) rotate(1deg)}66%{transform:translateY(4px) rotate(-1deg)}}
        .anim-fs{animation:fslow 8s ease-in-out infinite}
      `}</style>

      {/* ── Nav ── */}
      <nav className={`fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-white/70 dark:bg-[#1a1a24]/70 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-1 fd">
            <Logo size={30} />
            <span className="font-bold text-lg tracking-widest">ing</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNote(true)}
              className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              致辞
            </button>
            <a
              href="https://github.com/guyi-a/Ling-Agent"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
            </a>
            <button onClick={toggleTheme} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-all">
              {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center hero-mesh dot-grid">
        {/* decorative rings */}
        <div className="absolute top-24 right-[12%] w-72 h-72 rounded-full border border-primary-200/20 dark:border-primary-500/10 pointer-events-none" />
        <div className="absolute bottom-28 left-[8%] w-48 h-48 rounded-full border border-accent-200/20 dark:border-accent-500/10 pointer-events-none" />
        {/* floating dots */}
        <div className="absolute top-[30%] left-[6%] w-2 h-2 rounded-full bg-primary-400/40 anim-fs" />
        <div className="absolute top-[22%] right-[18%] w-1.5 h-1.5 rounded-full bg-accent-400/40 anim-fs" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-[30%] right-[10%] w-2 h-2 rounded-full bg-emerald-400/30 anim-fs" style={{ animationDelay: '4s' }} />

        <div className={`relative z-10 max-w-4xl mx-auto px-6 text-center ${mounted ? '' : 'opacity-0'}`}>
          {/* badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gray-200/80 dark:border-gray-700/50 bg-white/60 dark:bg-white/5 backdrop-blur-sm text-xs font-medium text-gray-500 dark:text-gray-400 mb-10 ${mounted ? 'fu' : ''}`}>
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            五个专业 Agent · 全场景覆盖
          </div>

          {/* title */}
          <div className={mounted ? 'fu d1' : ''}>
            <h1 className="fd font-extrabold tracking-tighter leading-[0.9]">
              <span className="text-6xl sm:text-8xl lg:text-[7rem] text-gray-900 dark:text-white">Ling</span>
              <span className="text-6xl sm:text-8xl lg:text-[7rem] bg-gradient-to-r from-primary-400 via-accent-400 to-primary-500 bg-clip-text text-transparent anim-grad ml-3 sm:ml-5">Agent</span>
            </h1>
          </div>

          {/* subtitle */}
          <div className={`mt-8 ${mounted ? 'fu d2' : ''}`}>
            <p className="text-lg sm:text-2xl text-gray-500 dark:text-gray-400 font-light leading-relaxed">
              AI 驱动的多智能体生产力平台
            </p>
            <p className="mt-2 text-sm sm:text-base text-gray-400 dark:text-gray-500 max-w-lg mx-auto">
              对话 · 开发 · 数据 · 文档 · 身心健康 — 五大专业智能体协同工作
            </p>
          </div>

          {/* CTA */}
          <div className={`mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 ${mounted ? 'fu d3' : ''}`}>
            <button
              onClick={() => navigate('/login')}
              className="group inline-flex items-center gap-2.5 px-8 py-3.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-base font-medium rounded-full hover:opacity-90 shadow-2xl shadow-gray-900/20 dark:shadow-black/30 transition-all hover:scale-[1.02]"
            >
              立即体验
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              探索功能
              <ArrowRight className="w-3.5 h-3.5 rotate-90" />
            </button>
          </div>

          {/* highlights */}
          <div className={`mt-16 flex flex-wrap justify-center gap-6 sm:gap-8 text-sm text-gray-400 dark:text-gray-500 ${mounted ? 'fu d4' : ''}`}>
            {[
              { icon: Zap, text: '流式响应', color: 'text-amber-400' },
              { icon: Shield, text: '安全可控', color: 'text-emerald-400' },
              { icon: Heart, text: '温暖共情', color: 'text-rose-400' },
            ].map((h) => (
              <div key={h.text} className="flex items-center gap-2">
                <h.icon className={`w-4 h-4 ${h.color}`} />
                <span>{h.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* scroll hint */}
        <div className={`absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 ${mounted ? 'fu d7' : ''}`}>
          <span className="text-[10px] tracking-[.2em] uppercase text-gray-300 dark:text-gray-600">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-gray-300 dark:from-gray-600 to-transparent" />
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" ref={feat.ref} className="relative py-24 sm:py-32 px-6 bg-gray-50/50 dark:bg-white/[0.015]">
        <div className="max-w-6xl mx-auto">
          <div className={`max-w-2xl mb-14 sm:mb-16 transition-all duration-700 ${feat.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <p className="text-xs font-semibold tracking-[.15em] uppercase text-primary-500 dark:text-primary-400 mb-3 fd">Capabilities</p>
            <h2 className="text-3xl sm:text-4xl font-bold fd tracking-tight">六大核心能力</h2>
            <p className="mt-3 text-gray-400 dark:text-gray-500">覆盖工作与生活的全场景需求</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`fc group relative p-7 rounded-2xl border border-gray-100 dark:border-gray-800/80 bg-white dark:bg-white/[0.05] hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-black/20 transition-all duration-700 ${feat.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                style={{ transitionDelay: feat.visible ? `${120 + i * 70}ms` : '0ms' }}
              >
                <div className={`fi w-11 h-11 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-5 shadow-lg shadow-gray-200/50 dark:shadow-none`}>
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-base font-semibold mb-1.5 fd">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section ref={cta.ref} className="py-24 sm:py-32 px-6">
        <div className={`max-w-2xl mx-auto text-center transition-all duration-700 ${cta.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="text-3xl sm:text-4xl font-bold fd tracking-tight mb-4">准备好了吗？</h2>
          <p className="text-gray-400 dark:text-gray-500 mb-10">注册账号，开始探索 AI 驱动的全新工作方式</p>
          <button
            onClick={() => navigate('/login')}
            className="group inline-flex items-center gap-2.5 px-10 py-4 bg-gradient-to-r from-primary-500 to-accent-500 text-white text-base font-medium rounded-full shadow-xl shadow-primary-500/25 hover:shadow-2xl hover:shadow-primary-500/30 hover:scale-[1.02] transition-all glow"
          >
            立即前往
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-6 border-t border-gray-100 dark:border-gray-800/60">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400 dark:text-gray-500">
          <div className="flex items-center gap-2">
            <Logo size={20} />
            <span className="fd font-medium">Ling-Agent</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="https://github.com/guyi-a/Ling-Agent" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              GitHub
            </a>
            <span>Built with LangGraph + React</span>
          </div>
        </div>
      </footer>

      {/* ── 致辞弹窗 ── */}
      {showNote && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowNote(false)}>
          <div
            className="relative max-w-lg mx-6 p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl fu"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setShowNote(false)} className="absolute top-4 right-4 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors text-lg">✕</button>
            <h3 className="text-lg font-bold fd mb-4 text-gray-900 dark:text-white">写在前面</h3>
            <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed space-y-3">
              <p>Ling-Agent 是一个面向个人生产力的多智能体 AI 平台。它不是一个简单的聊天机器人，而是五个专业 Agent 协同工作的系统 — 覆盖日常对话、软件开发、数据分析、文档处理和身心健康。</p>
              <p>这个项目从一个简单的想法开始：让 AI 不只是回答问题，而是真正地帮你做事。每一个 Agent 都有自己的专业能力和工具集，由 Supervisor 智能调度，像一支小团队一样为你工作。</p>
              <p>希望它能成为你得力的数字伙伴。</p>
            </div>
            <p className="mt-5 text-xs text-gray-400 dark:text-gray-500 text-right fd">— Ling-Agent Team</p>
          </div>
        </div>
      )}
    </div>
  )
}
