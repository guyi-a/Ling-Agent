---
name: data-cleaning
label: 数据清洗
description: MANDATORY before any data analysis. Understand data structure and create column mappings.
---

## Language Settings

**Default: Chinese (中文)**

All output (column labels, filenames) uses Chinese by default.

**Switch to English:** User can request English output via prompts like:
- "use English" / "in English" / "英文输出"

When English is requested, create English column mappings instead of Chinese.

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

## Workflow (MUST FOLLOW)

### Step 1: Load and inspect data

```python
import pandas as pd

df = pd.read_csv('data.csv')  # or read_excel

# Inspect data structure
print("=== Column Info ===")
print(df.dtypes)
print("\n=== Sample Data ===")
print(df.head(10))
print("\n=== Statistics ===")
print(df.describe(include='all'))
```

### Step 2: Create column mapping (REQUIRED)

**Before ANY visualization, you MUST create a mapping dict.**

### Step 3: Data cleaning

```python
# Handle missing values
df = df.dropna()  # or df.fillna(value)

# Remove duplicates
df = df.drop_duplicates()

# Fix data types
df['date'] = pd.to_datetime(df['date'])
df['revenue'] = pd.to_numeric(df['revenue'], errors='coerce')
```

---

## Rules (MUST FOLLOW)

| Rule | Description |
|------|-------------|
| Consistent language | All labels in same language (Chinese by default, English if requested) |
| Understand before translate | Check sample values to infer meaning, not literal translation |
| Map ALL columns | Every column used in visualization MUST have mapped label |
| Consistent naming | Use same COLUMN_LABELS dict across all charts in one task |

---

## Output

After cleaning, save processed data:

```python
df_clean = df.rename(columns=COLUMN_LABELS)
df_clean.to_csv('cleaned_data.csv', index=False, encoding='utf-8-sig')
```
