import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Moon, Sun, Monitor, Bell, Globe } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'

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
        <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
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
        checked ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'
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

export default function SettingsPage() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeStore()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶栏 */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/chat')}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">设置</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {/* 外观 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl px-5 shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
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

        {/* 即将推出 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl px-5 shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
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
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
              即将推出
            </span>
          </SettingRow>

          <SettingRow
            icon={<Globe className="w-5 h-5" />}
            label="语言"
            description="界面语言设置"
          >
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
              即将推出
            </span>
          </SettingRow>

          <SettingRow
            icon={<Monitor className="w-5 h-5" />}
            label="模型"
            description="切换对话使用的 AI 模型"
          >
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
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
