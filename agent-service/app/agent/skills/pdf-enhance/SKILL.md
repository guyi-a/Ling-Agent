---
name: pdf-enhance
label: PDF 增强
description: MANDATORY for any PDF generation. Ensure every PDF has correct layout, readable content, coherent grouping, and safe auto-fixes before delivery.
---

## Language Settings

**Default: Chinese (中文)**

All text content uses Chinese fonts and labels by default.

**Switch to English:** User can request English output via prompts like:
- "use English" / "in English" / "英文输出"

When English is requested, use default system fonts (Arial, Helvetica) instead of Chinese fonts.

---

## Chinese Font Configuration (DEFAULT)

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

**For PDF text elements, also include:**

```python
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

_font_path = Path.home() / ".krow" / "fonts" / "NotoSansSC.ttf"
pdfmetrics.registerFont(TTFont('ChineseFont', str(_font_path)))
PDF_FONT = 'ChineseFont'

STYLES = getSampleStyleSheet()
STYLES.add(ParagraphStyle(name='Chinese', fontName=PDF_FONT, fontSize=12, leading=18))
STYLES.add(ParagraphStyle(name='ChineseTitle', fontName=PDF_FONT, fontSize=24, leading=30))
STYLES.add(ParagraphStyle(name='ChineseH1', fontName=PDF_FONT, fontSize=18, leading=24))
```

**MUST use `STYLES['Chinese']` for all Paragraph elements.**

---

## Layout Assurance Prompt (MUST FOLLOW)

Your job is to **guarantee correct layout**, not to add decorative enhancement.

Always optimize for:
- readability
- semantic grouping
- container ownership
- spacing and pagination stability
- safe content density

If beauty conflicts with layout correctness, **layout correctness wins**.

## Required Output Standard

The final PDF must satisfy all of the following:
- no readable text is clipped, cropped, or hidden
- no harmful collision between unrelated content
- text stays with its visual or semantic owner
- hierarchy remains clear: title, heading, body, caption, note
- margins, padding, and section spacing remain coherent
- pagination improves readability instead of harming it
- dense content continues to later pages instead of being over-compressed

## Mandatory Decision Order

Whenever layout is imperfect, fix in this order:
1. preserve readability
2. preserve semantic grouping
3. preserve container ownership
4. preserve spacing rhythm and alignment
5. preserve hierarchy
6. only then improve compactness

## Container and Text Rule (CRITICAL)

If text is visually enclosed by or strongly aligned with a panel, card, border, callout, note box, highlighted region, or diagram node, treat them as **one composite component**.

Assume a text block belongs to a container when any of the following is true:
- it sits inside the container bounds
- it is centered or edge-aligned within that container
- it has stable inset spacing relative to the container edges
- separating it would clearly break the reading relationship

In that case:
- the outer region defines the content area
- the text is the content layer
- fix layout using the container's content area, padding, and reading intent
- do NOT detach the text from the container just to satisfy generic spacing rules

Flowable type is secondary. Visual ownership matters more than raw object separation.

## Required Fix Strategy

Use the least destructive fix first:
1. adjust available text width or height
2. restore internal padding
3. improve wrapping or line breaks
4. adjust leading or paragraph spacing
5. reduce font size slightly if still readable
6. reposition the local component inside its section
7. continue content to the next page

Do not jump directly to full-page redesign.

## Text and Pagination Rules

- prefer wrapping over aggressive shrinking
- prefer vertical growth or next-page flow over horizontal squeezing
- keep titles and headings visually compact and distinct
- avoid awkward fragmentation of labels, notes, and short callouts
- keep captions attached to the relevant figure or table
- do not truncate unless explicitly allowed
- if text cannot stay readable, continue to the next page instead of compressing further

## Overlap Rules

- text inside its own visual container is usually valid
- text overlapping decorative accents can be valid if readability is unaffected
- text colliding with unrelated text, figures, tables, or page furniture is invalid
- if overlap happens inside a composite container, fix padding or text area first

## Forbidden Behaviors

- do NOT prioritize decoration over layout correctness
- do NOT break a valid container + text relationship
- do NOT force all content onto one page
- do NOT flatten meaningful layout groupings into plain paragraphs
- do NOT treat every decorative overlap as an error
- do NOT redesign the whole page when a local fix is enough

## Final Acceptance Check

Before delivery, verify:
- all text is readable
- section structure remains coherent
- all composite container + text relationships still make visual sense
- no local fix caused a new collision or broken page flow
- content density remains comfortable
- overflow was solved by continuation to later pages when needed
