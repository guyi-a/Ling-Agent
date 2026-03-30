---
name: data-analysis
label: 数据分析
description: Analyze CSV/Excel data and create visualizations
---

## Language Settings

**Default: Chinese (中文)**

All output (chart labels, titles, filenames) uses Chinese by default.

**Switch to English:** User can request English output via prompts like:
- "use English" / "in English" / "英文输出"
- "English labels" / "English titles"

When English is requested, skip Chinese font configuration and use default matplotlib fonts.

---

## Chinese Font & Naming (DEFAULT for ALL charts)

**CRITICAL: Copy this EXACT block as the FIRST lines of every script:**

```python
# ========== 字体配置 - 必须放在最开头 ==========
import matplotlib.font_manager as fm
from pathlib import Path

font_path = Path.home() / ".krow" / "fonts" / "NotoSansSC.ttf"
fm.fontManager.addfont(str(font_path))

import matplotlib.pyplot as plt  # 必须在 addfont 之后！

def set_chinese_font():
    """设置中文字体 - 在 sns.set_style() 之后调用"""
    plt.rcParams["font.family"] = fm.FontProperties(fname=str(font_path)).get_name()
    plt.rcParams["axes.unicode_minus"] = False

set_chinese_font()
# ========== 字体配置结束 ==========
```

**WARNING:**
1. `import matplotlib.pyplot as plt` MUST come AFTER `addfont()`
2. If using seaborn `sns.set_style()` or `sns.set_theme()`, call `set_chinese_font()` AFTER it:

```python
import seaborn as sns
sns.set_style("whitegrid")
set_chinese_font()  # 必须在 sns.set_style 之后重新调用！
```

**Naming requirements (mandatory):**
- All chart elements MUST use Chinese
- Output filenames MUST be in Chinese
- Translate column names to meaningful Chinese labels before plotting

## Data Analysis Mode

When analyzing data (CSV, Excel, etc.):

1. **Run `data-cleaning` first** - Create COLUMN_LABELS mapping before any visualization
2. Use `pandas` for data processing
3. Use `matplotlib` or `seaborn` for visualization
4. **Auto-enhance charts** - Apply professional styling, clear labels, and visual polish to all generated charts

**IMPORTANT**: Use `df.rename(columns=COLUMN_LABELS)` to ensure all chart labels are in Chinese.

**Pre-installed libraries** (no need to install):
- `pandas` - data manipulation
- `matplotlib`, `seaborn` - visualization
- `python-docx` - Word documents (.docx)
- `python-pptx` - PowerPoint (.pptx)
