---
name: report-generator
label: 报告生成
description: Generate reports (PDF or PPTX). All generated documents MUST follow report structure rules and pass corresponding validation.
---

## Language Settings

**Default: Chinese (中文)**

All output (titles, labels, filenames, analysis text) uses Chinese by default.

**Switch to English:** User can request English output via prompts like:
- "use English" / "in English" / "英文输出"

When English is requested, use English for all text content and default system fonts.

---

## Chinese Font & Naming (DEFAULT for ALL charts)

**CRITICAL: Copy this EXACT block as the FIRST lines of every script:**

```python
# ========== 字体配置 - 必须放在最开头 ==========
import matplotlib.font_manager as fm
from pathlib import Path

font_path = Path.home() / ".ling-agent" / "fonts" / "NotoSansSC.ttf"
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
- Translate column names to meaningful Chinese labels

---

## Content flow
```
For each data point:
1. Introduction text (what we're analyzing)
2. Chart/visualization
3. Analysis text (what the chart tells us)
4. Conclusion/recommendation (if applicable)
```

---

## Pre-installed Libraries

- `reportlab` - PDF generation
- `python-pptx` - PowerPoint generation
- `pandas` - data processing
- `matplotlib`, `seaborn` - visualization

---

## Post-generation Requirements

After generating any report:

1. **PDF output** → Run `pdf-enhance` validation and auto-fix
2. **PPTX output** → Run `pptx-enhance` validation and auto-fix
3. **All charts** → Follow `data-analysis` styling rules

Auto-enhance all generated documents for professional quality.
