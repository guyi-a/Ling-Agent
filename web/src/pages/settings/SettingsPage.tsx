import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Moon, Sun, Monitor, Bell, Globe, Shield, Zap, Wrench } from 'lucide-react'
import Logo from '@/components/Logo'
import { useThemeStore } from '@/stores/themeStore'
import { useSettingsStore } from '@/stores/settingsStore'

const TOOL_LABELS: Record<string, string> = {
  run_command: '执行命令',
  python_repl: '执行 Python',
  write_file: '写入文件',
  edit_file: '编辑文件',
  dev_run: '启动服务',
}

const ALL_TOOLS = Object.keys(TOOL_LABELS)

function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon: React.ReactNode
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
          {icon}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</div>
          {description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</div>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-700'
      }`}
    >
      <div
        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

type ToolApprovalStatus = 'ask' | 'allow' | 'deny'

function ToolStatusSelector({ tool, status, onChange }: {
  tool: string
  status: ToolApprovalStatus
  onChange: (status: ToolApprovalStatus) => void
}) {
  const options: { value: ToolApprovalStatus; label: string; color: string; activeColor: string }[] = [
    { value: 'ask', label: '审批', color: 'text-gray-600 dark:text-gray-400', activeColor: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800' },
    { value: 'allow', label: '允许', color: 'text-gray-600 dark:text-gray-400', activeColor: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-300 dark:border-green-800' },
    { value: 'deny', label: '拒绝', color: 'text-gray-600 dark:text-gray-400', activeColor: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800' },
  ]

  return (
    <div className="flex items-center justify-between py-3">
      <div className="text-sm text-gray-900 dark:text-gray-100">
        <span className="font-medium">{TOOL_LABELS[tool] || tool}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">{tool}</span>
      </div>
      <div className="flex gap-1">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
              status === opt.value
                ? opt.activeColor
                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeStore()
  const {
    approvalMode, toolAllowlist, toolDenylist,
    loaded, load, setApprovalMode, setToolStatus,
  } = useSettingsStore()

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  const getToolStatus = (tool: string): ToolApprovalStatus => {
    if (toolAllowlist.includes(tool)) return 'allow'
    if (toolDenylist.includes(tool)) return 'deny'
    return 'ask'
  }

  const modes = [
    { value: 'default' as const, icon: <Shield className="w-4 h-4" />, label: '默认', desc: '高危工具需要审批' },
    { value: 'auto' as const, icon: <Zap className="w-4 h-4" />, label: '自动', desc: '全部自动通过' },
    { value: 'custom' as const, icon: <Wrench className="w-4 h-4" />, label: '自定义', desc: '逐工具配置' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a24]">
      {/* 顶栏 */}
      <div className="sticky top-0 z-10 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/70 dark:bg-[#22222e]/70 backdrop-blur-xl">
        <div className="px-6 h-16 flex items-center gap-3">
          <button
            onClick={() => navigate('/chat')}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 flex-1">
            <Logo size={24} />
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">设置</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {/* 外观 */}
        <div className="bg-white dark:bg-[#22222e] rounded-2xl px-5 shadow-sm border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          <div className="py-3">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              外观
            </h2>
          </div>

          <SettingRow
            icon={isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            label="深色模式"
            description="切换界面深色 / 浅色主题"
          >
            <Toggle checked={isDark} onChange={toggleTheme} />
          </SettingRow>
        </div>

        {/* 工具审批 */}
        <div className="bg-white dark:bg-[#22222e] rounded-2xl px-5 shadow-sm border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          <div className="py-3">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              工具审批
            </h2>
          </div>

          <div className="py-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              控制 AI 使用高危工具时是否需要您的确认
            </div>
            <div className="flex gap-2">
              {modes.map(m => (
                <button
                  key={m.value}
                  onClick={() => setApprovalMode(m.value)}
                  className={`flex-1 px-3 py-2.5 rounded-xl border text-sm transition-colors flex flex-col items-center gap-1.5 ${
                    approvalMode === m.value
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/15 text-indigo-700 dark:text-indigo-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  {m.icon}
                  <span className="font-medium">{m.label}</span>
                  <span className="text-[11px] opacity-70">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {approvalMode === 'custom' && (
            <div className="py-2 divide-y divide-gray-100 dark:divide-gray-700">
              {ALL_TOOLS.map(tool => (
                <ToolStatusSelector
                  key={tool}
                  tool={tool}
                  status={getToolStatus(tool)}
                  onChange={(s) => setToolStatus(tool, s)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 即将推出 */}
        <div className="bg-white dark:bg-[#22222e] rounded-2xl px-5 shadow-sm border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          <div className="py-3">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              即将推出
            </h2>
          </div>

          <SettingRow
            icon={<Bell className="w-5 h-5" />}
            label="通知"
            description="工具审批提醒、任务完成通知"
          >
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 rounded-full">
              即将推出
            </span>
          </SettingRow>

          <SettingRow
            icon={<Globe className="w-5 h-5" />}
            label="语言"
            description="界面语言设置"
          >
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 rounded-full">
              即将推出
            </span>
          </SettingRow>

          <SettingRow
            icon={<Monitor className="w-5 h-5" />}
            label="模型"
            description="切换对话使用的 AI 模型"
          >
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 rounded-full">
              即将推出
            </span>
          </SettingRow>
        </div>

        {/* 版本信息 */}
        <div className="text-center text-xs text-gray-400 dark:text-gray-600 pt-2">
          Ling-Agent v1.0.0
        </div>
      </div>
    </div>
  )
}
