import { memo, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useThemeStore } from '@/stores/themeStore'
import { Copy, Check } from 'lucide-react'
import 'katex/dist/katex.min.css'

// ─── Mermaid 组件（懒加载渲染）───

function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, theme: 'default' })
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const { svg: rendered } = await mermaid.render(id, code)
        if (!cancelled) setSvg(rendered)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '图表渲染失败')
      }
    })()
    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <pre className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg overflow-auto">
        {error}
      </pre>
    )
  }
  if (!svg) {
    return <div className="p-4 text-gray-400 text-sm">图表加载中...</div>
  }
  return (
    <div
      ref={containerRef}
      className="my-3 flex justify-center overflow-auto bg-white dark:bg-gray-900 rounded-lg p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// ─── 代码块组件 ───

function CodeBlock({ className, children, ...props }: any) {
  const { isDark } = useThemeStore()
  const [copied, setCopied] = useState(false)
  const codeString = String(children).replace(/\n$/, '')
  const match = /language-(\w+)/.exec(className || '')
  const language = match?.[1] || ''

  // Mermaid
  if (language === 'mermaid') {
    return <MermaidBlock code={codeString} />
  }

  // 行内 code
  if (!match) {
    return (
      <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-pink-600 dark:text-pink-400 text-sm rounded font-mono" {...props}>
        {children}
      </code>
    )
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group/code relative my-3 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* 语言标签 + 复制按钮 */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-100 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
        <span className="font-mono uppercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 opacity-0 group-hover/code:opacity-100 transition-opacity hover:text-gray-700 dark:hover:text-gray-200"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={language}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8125rem' }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  )
}

// ─── 表格组件 ───

function Table({ children }: any) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
        {children}
      </table>
    </div>
  )
}

function Thead({ children }: any) {
  return <thead className="bg-gray-50 dark:bg-gray-800">{children}</thead>
}

function Th({ children }: any) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
      {children}
    </th>
  )
}

function Td({ children }: any) {
  return (
    <td className="px-4 py-2 text-gray-700 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700/50">
      {children}
    </td>
  )
}

// ─── 主组件 ───

interface MarkdownRendererProps {
  content: string
}

export default memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code: CodeBlock,
        table: Table,
        thead: Thead,
        th: Th,
        td: Td,
        img: () => null,
      }}
    >
      {content}
    </ReactMarkdown>
  )
})
