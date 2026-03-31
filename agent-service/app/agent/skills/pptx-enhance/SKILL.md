---
name: pptx-enhance
label: PPT 增强
description: MANDATORY for any PowerPoint generation. Ensure every PPTX has correct layout, readable content, coherent grouping, and safe auto-fixes before delivery.
---

## Language Settings

**Default: Chinese (中文)**

All text content uses Chinese fonts by default.

**Switch to English:** User can request English output via prompts like:
- "use English" / "in English" / "英文输出"

When English is requested, use default fonts (Arial, Calibri) instead of Chinese fonts.

---

## Chinese Font Configuration (DEFAULT)

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

**For PPTX text elements, also include:**

```python
from pptx.oxml.ns import qn
PPTX_FONT = "Microsoft YaHei"

def apply_chinese_font(shape):
    """Apply Chinese font to all text - call for every text shape before saving"""
    if not hasattr(shape, "text_frame"): return
    for para in shape.text_frame.paragraphs:
        for run in para.runs:
            run.font.name = PPTX_FONT
            run._r.get_or_add_rPr().get_or_add_rFonts().set(qn('a:ea'), PPTX_FONT)
```

---

## Layout Assurance Prompt (MUST FOLLOW)

Your job is to **guarantee correct layout**, not to add decorative enhancement.

Always optimize for:
- readability
- semantic grouping
- container ownership
- alignment and spacing consistency
- safe content density

If beauty conflicts with layout correctness, **layout correctness wins**.

## Required Output Standard

The final PPTX must satisfy all of the following:
- no object exceeds slide bounds
- no readable text is clipped, cropped, or hidden
- no harmful overlap between unrelated content
- text stays with its visual or semantic owner
- hierarchy remains clear: title, section, body, caption, note
- spacing remains coherent within and across blocks
- dense content is split into more slides instead of over-compressed

## Mandatory Decision Order

Whenever layout is imperfect, fix in this order:
1. preserve readability
2. preserve semantic grouping
3. preserve shape-text ownership
4. preserve alignment axes and spacing rhythm
5. preserve hierarchy
6. only then improve compactness

## Shape and TextBox Rule (CRITICAL)

If a shape visually contains, anchors, or owns a separate textbox, treat them as **one composite component**.

Assume a textbox belongs to a shape when any of the following is true:
- its center lies inside the shape bounds
- it has stable inner margins relative to the shape
- it shares center or edge alignment with the shape
- the shape visually acts as a card, panel, node, label background, callout, or button

In that case:
- the shape is the container
- the textbox is the content layer
- fix layout using the container's content area, inner padding, and reading intent
- do NOT detach the textbox from the shape just to satisfy generic spacing rules

Grouping metadata is secondary. Visual ownership matters more than raw hierarchy.

## Required Fix Strategy

Use the least destructive fix first:
1. adjust textbox width or height
2. restore internal padding
3. improve wrapping
4. reduce font size slightly if still readable
5. reposition the local component
6. resize or move decorative elements
7. split content into more slides

Do not jump directly to full-slide redesign.

## Text Rules

- prefer wrapping over aggressive shrinking
- prefer growing downward over growing sideways
- keep titles compact when possible
- avoid awkward label wrapping
- do not truncate unless explicitly allowed
- if text cannot stay readable, split slides instead of compressing further

## Overlap Rules

- text on its own background shape is usually valid
- text overlapping decorative accents can be valid if readability is unaffected
- text colliding with unrelated text, charts, tables, or images is invalid
- if overlap happens inside a composite component, fix padding or text area first

## Forbidden Behaviors

- do NOT prioritize decoration over layout correctness
- do NOT break a valid shape + textbox relationship
- do NOT force all content onto one slide
- do NOT flatten meaningful layout variation into generic uniform blocks
- do NOT treat every shape-text overlap as an error
- do NOT redesign the whole slide when a local fix is enough

## Final Acceptance Check

Before delivery, verify:
- all text is readable
- all semantic groups remain intact
- all composite shape + textbox components still make visual sense
- no local fix caused a new collision
- content density remains comfortable
- overflow was solved by splitting slides when needed
