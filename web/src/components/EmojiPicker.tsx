import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Upload } from 'lucide-react'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onUpload?: (file: File) => void
  onClose: () => void
  onClear?: () => void
}

const CATEGORIES: Record<string, string[]> = {
  '笑脸': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  '手势': ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💪','🦾','🦿'],
  '动物': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🪳','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🪸','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🪿','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
  '食物': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🫛','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🫘','🥐','🥖','🍞','🥨','🥯','🧇','🥞','🧈','🍳','🥚','🧀','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍡','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🫗','🥃','🍸','🍹','🧉','🍾','🧊','🥄','🍴','🍽️','🥣','🥡','🥢'],
  '活动': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤸','🤺','⛹️','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🕹️','🎰'],
  '物品': ['💡','🔦','🕯️','🪔','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','📡','🔋','🔌','🪫','💎','🧲','🔧','🪛','🔩','⚙️','🧱','🪜','🧰','🪤','🔬','🔭','📡','💉','🩸','💊','🩹','🩼','🩻','🩺','🚪','🪞','🪟','🛏️','🛋️','🪑','🚽','🪠','🚿','🛁','🪥','🪒','🧴','🧷','🧹','🧺','🧻','🪣','🧼','🫧','🧽','🧯','🛒','🏺','🔮','📿','🧿','🪬','💈','⚗️','🪄','🎀','🎁','🎈','🎏','🎐','🎑','🧧','🎊','🎉','🎎','🏮','🎍','🪩','🪅','🪆','🧸'],
  '符号': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','💯','💢','♨️','❗','❕','❓','❔','‼️','⁉️','✅','❌','⭕','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🎵','🎶','➕','➖','➗','✖️','♾️','💲'],
}

export default function EmojiPicker({ onSelect, onUpload, onClose, onClear }: EmojiPickerProps) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'emoji' | 'upload'>('emoji')
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 10 * 1024 * 1024) return
    onUpload?.(file)
    onClose()
  }, [onUpload, onClose])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const filtered = search
    ? Object.entries(CATEGORIES).reduce<Record<string, string[]>>((acc, [cat, emojis]) => {
        const matched = emojis.filter(e => e.includes(search))
        if (matched.length) acc[cat] = matched
        return acc
      }, {})
    : CATEGORIES

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full left-0 mt-2 w-80 bg-white dark:bg-[#2a2a38] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden"
    >
      {/* Tabs */}
      {onUpload && (
        <div className="flex border-b border-gray-100 dark:border-gray-700/50">
          <button
            onClick={() => setTab('emoji')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'emoji'
                ? 'text-gray-900 dark:text-gray-100 border-b-2 border-gray-900 dark:border-gray-100'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            Emoji
          </button>
          <button
            onClick={() => setTab('upload')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'upload'
                ? 'text-gray-900 dark:text-gray-100 border-b-2 border-gray-900 dark:border-gray-100'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            上传图片
          </button>
        </div>
      )}

      {tab === 'emoji' ? (
        <>
          {/* Search */}
          <div className="p-3 border-b border-gray-100 dark:border-gray-700/50">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 emoji"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Emoji Grid */}
          <div className="max-h-64 overflow-y-auto p-2">
            {Object.entries(filtered).map(([category, emojis]) => (
              <div key={category} className="mb-2">
                <div className="px-2 py-1 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                  {category}
                </div>
                <div className="flex flex-wrap">
                  {emojis.map((emoji, i) => (
                    <button
                      key={i}
                      onClick={() => { onSelect(emoji); onClose() }}
                      className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Upload Area */
        <div className="p-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
              dragging
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.02]'
            }`}
          >
            <Upload className="w-6 h-6 text-gray-400 dark:text-gray-500 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">点击或拖入图片</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PNG / JPG，不超过 10MB</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </div>
      )}

      {/* Clear */}
      {onClear && (
        <div className="border-t border-gray-100 dark:border-gray-700/50 p-2">
          <button
            onClick={() => { onClear(); onClose() }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-3 h-3" />
            清除自定义
          </button>
        </div>
      )}
    </div>
  )
}
