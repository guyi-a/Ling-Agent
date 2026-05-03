---
name: psych-interactive
label: 心理健康交互工具
description: >
  Build interactive psychological health tools: breathing guide animation, cognitive distortion training game, or emotion wheel. Trigger when user wants a breathing exercise, cognitive training, mindfulness tool, or emotion exploration wheel.
---

## Overview

This skill provides specifications for building **interactive psychological health tools** as web pages. These are single-page apps with rich animations and interactivity, served via the standard web-dev workflow (FastAPI + static HTML).

**IMPORTANT:** You must have already loaded the `web-dev` skill before using this one. Follow the web-dev workflow (PLAN.md → backend → frontend → dev_run → preview).

## Which Tool to Build

Based on the user's request, build ONE of the following:

| Keyword | Tool |
|---------|------|
| 呼吸/breathing/放松/calm down/焦虑缓解 | Breathing Guide |
| 认知扭曲/cognitive/思维陷阱/thinking trap | Cognitive Distortion Training |
| 情绪轮/emotion wheel/描述感受/情绪颗粒度 | Emotion Wheel |

---

## Tool A: Breathing Guide (呼吸引导器)

### Design Spec

A calming full-page breathing exercise with animated circle and phase indicators.

### Breathing Modes

| Mode | Inhale | Hold | Exhale | Hold | Use Case |
|------|--------|------|--------|------|----------|
| 4-7-8 放松法 | 4s | 7s | 8s | 0s | 焦虑/失眠 |
| Box Breathing | 4s | 4s | 4s | 4s | 专注/压力 |
| 深呼吸 | 4s | 2s | 6s | 0s | 日常放松 |

### UI Requirements

1. **Central circle**: 150px→250px scale animation synced to breathing phase. Color transitions: inhale=soft blue, hold=purple, exhale=teal
2. **Phase text**: Large centered text below circle — "吸气...", "屏住...", "呼气...", "保持..."
3. **Timer ring**: Thin circular progress around the main circle showing phase progress
4. **Mode selector**: Three pill buttons at top to switch modes
5. **Round counter**: "第 3/5 轮" — user can set target rounds (default 5)
6. **Controls**: Start/Pause button, Reset button
7. **Completion screen**: When target rounds done, show total time + encouraging message ("做得很好！你刚刚花了 X 分钟照顾自己")
8. **Background**: Gradient that subtly shifts with breathing phase (darker on exhale, lighter on inhale)
9. **No backend API needed** — pure frontend logic, but still need main.py to serve the static file

### Animation Implementation

Use CSS keyframes + JavaScript timing. The circle scales via `transform: scale()` with `transition` matching the current phase duration. Phase text and color update at each transition point via `setTimeout` chain.

```javascript
// Core timing logic pattern
const MODES = {
  '4-7-8': { inhale: 4, hold1: 7, exhale: 8, hold2: 0 },
  'box':   { inhale: 4, hold1: 4, exhale: 4, hold2: 4 },
  'deep':  { inhale: 4, hold1: 2, exhale: 6, hold2: 0 },
}

function runPhase(phase, duration, next) {
  // Update UI: text, color, circle scale
  // After duration seconds, call next()
  setTimeout(next, duration * 1000)
}
```

### Styling

- Font: system sans-serif, large phase text (2rem+)
- Use `backdrop-filter: blur()` for frosted glass effect on controls
- Minimal UI — the circle and breathing are the focus
- Mobile friendly — works in narrow iframe

---

## Tool B: Cognitive Distortion Training (认知扭曲训练)

### Design Spec

An interactive quiz-style game that teaches users to identify cognitive distortions in everyday thoughts.

### 10 Cognitive Distortions

| ID | Name | Chinese | Example |
|----|------|---------|---------|
| mind_reading | Mind Reading | 读心术 | "他没回消息，一定是讨厌我了" |
| catastrophizing | Catastrophizing | 灾难化 | "这次面试搞砸了，我这辈子完了" |
| overgeneralization | Overgeneralization | 过度泛化 | "我总是把事情搞砸" |
| black_white | All-or-Nothing | 非黑即白 | "考不到满分就是失败" |
| should | Should Statements | 应该思维 | "我应该能处理好所有事情" |
| personalization | Personalization | 个人化 | "同事心情不好肯定是因为我" |
| labeling | Labeling | 标签化 | "我就是个废物" |
| emotional_reasoning | Emotional Reasoning | 情绪推理 | "我感觉很笨，所以我一定很笨" |
| mental_filter | Mental Filter | 选择性注意 | "虽然得了95分，但那5分的错误说明我不行" |
| disqualifying | Disqualifying the Positive | 否定正面 | "他夸我只是客气，不是真心的" |

### Question Bank (inline in HTML — at least 20 questions)

Each question has: `situation` (情境), `thought` (内心独白), `answer` (correct distortion ID), `explanation` (为什么是这个扭曲)

Example questions:
```json
[
  {
    "situation": "你发了一条朋友圈，半小时没人点赞",
    "thought": "没有人在意我，我在大家眼里根本不重要",
    "answer": "overgeneralization",
    "explanation": "从'一条动态没人点赞'推广到'没有人在意我'，是将单一事件当作普遍规律。也许朋友们只是没刷到，或者在忙。"
  },
  {
    "situation": "开会时你提了个建议，领导说'我们再考虑一下'",
    "thought": "领导觉得我的想法很蠢，我在公司没前途了",
    "answer": "mind_reading",
    "explanation": "'再考虑一下'有很多含义——可能确实需要更多讨论。你在揣测领导的真实想法，而非基于事实判断。"
  },
  {
    "situation": "你的好朋友今天看起来心情不太好",
    "thought": "是不是我上次说了什么让她不开心了",
    "answer": "personalization",
    "explanation": "把别人的情绪归因于自己。朋友心情不好可能有很多原因——工作、家庭、身体，不一定和你有关。"
  }
]
```

Include at least 20 questions covering all 10 types (2+ per type).

### UI Requirements

1. **Progress bar** at top: "第 5/10 题"
2. **Situation card**: Background with scenario text
3. **Thought bubble**: Styled as a thought cloud showing the inner monologue
4. **Options grid**: 2×5 grid of distortion buttons (or scrollable list on narrow screens)
5. **Feedback overlay**:
   - Correct: Green check + "✓ 正确！" + brief reinforcement
   - Wrong: Gentle orange + "这个其实是[正确答案]" + explanation
   - Both show a "下一题 →" button
6. **Results screen**: Score (e.g. "8/10"), performance per distortion type, encouraging message, weak areas highlighted
7. **Random selection**: Shuffle and pick 10 from the 20+ pool each session

### Styling

- Card-based layout, warm colors
- Thought bubble uses CSS pseudo-elements (triangle pointer)
- Smooth transitions between questions
- DaisyUI components for buttons and cards

---

## Tool C: Emotion Wheel (情绪轮盘)

### Design Spec

An interactive concentric emotion wheel that helps users identify and articulate their feelings with greater granularity.

### Emotion Hierarchy

```
生气 (Angry) → [暴怒, 挫败, 恼火, 嫉妒, 厌烦, 不耐烦]
悲伤 (Sad) → [失落, 委屈, 无力, 空虚, 孤独, 思念]
恐惧 (Fear) → [焦虑, 不安, 担忧, 恐慌, 紧张, 脆弱]
快乐 (Happy) → [感恩, 满足, 兴奋, 自豪, 希望, 平静]
惊讶 (Surprise) → [震惊, 困惑, 好奇, 敬畏, 意外, 不敢相信]
厌恶 (Disgust) → [鄙视, 反感, 失望, 无聊, 排斥, 尴尬]
```

### Color Mapping

| Primary Emotion | Hue | Outer Ring Color |
|----------------|-----|-----------------|
| 生气 | 0° (red) | #ef4444 → #f87171 |
| 悲伤 | 220° (blue) | #3b82f6 → #60a5fa |
| 恐惧 | 270° (purple) | #8b5cf6 → #a78bfa |
| 快乐 | 45° (yellow/gold) | #eab308 → #facc15 |
| 惊讶 | 30° (orange) | #f97316 → #fb923c |
| 厌恶 | 150° (green) | #22c55e → #4ade80 |

### UI Requirements

1. **Wheel layout**: SVG or CSS-based concentric circles
   - Outer ring: 6 equal sectors with primary emotions
   - Inner ring: Hidden initially, expands on click showing 6 sub-emotions per primary
2. **Interaction**:
   - Click primary → inner ring slides/fades in with sub-emotions
   - Click sub-emotion → it highlights and a record panel appears below
   - Click elsewhere or another primary → collapse current selection
3. **Record panel** (appears below wheel after selecting):
   - Selected emotion display (icon + name + color)
   - Intensity slider: 1-10 with gradient color matching emotion
   - Trigger input: "是什么引起了这种感觉？" (textarea)
   - "记录" button → stores locally (localStorage), shows confirmation toast
4. **Today's emotion map**: Small section below showing all emotions recorded today (colored dots or tags)
5. **Center of wheel**: Shows "选择你的感受" when nothing selected, or the selected sub-emotion when active

### Implementation — SVG Wheel

Use a 400×400 SVG with center (200,200). Draw 6 equal sectors (60° each) as `<path>` arcs. Each sector is clickable.

```javascript
// Generate one sector path (SVG arc)
function sectorPath(cx, cy, r1, r2, startAngle, endAngle) {
  const rad = a => (a - 90) * Math.PI / 180;
  const x1o = cx + r2 * Math.cos(rad(startAngle));
  const y1o = cy + r2 * Math.sin(rad(startAngle));
  const x2o = cx + r2 * Math.cos(rad(endAngle));
  const y2o = cy + r2 * Math.sin(rad(endAngle));
  const x1i = cx + r1 * Math.cos(rad(endAngle));
  const y1i = cy + r1 * Math.sin(rad(endAngle));
  const x2i = cx + r1 * Math.cos(rad(startAngle));
  const y2i = cy + r1 * Math.sin(rad(startAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M${x1o},${y1o} A${r2},${r2} 0 ${large} 1 ${x2o},${y2o} L${x1i},${y1i} A${r1},${r1} 0 ${large} 0 ${x2i},${y2i} Z`;
}

// Outer ring: r1=100, r2=180; Inner ring: r1=50, r2=98
// 6 sectors, each 60°: startAngle = i*60, endAngle = (i+1)*60
```

**Critical**: Outer sectors MUST be filled with their emotion color and show the emotion label as `<text>` centered within each sector. The wheel must be colorful and visible on load — NOT a blank circle.

- localStorage for persistence within session
- Responsive: on narrow screens, wheel scales down but remains usable

### Styling

- The wheel is the hero element — large, centered, colorful
- White/light background to let colors pop
- Subtle shadow on the wheel gives depth
- DaisyUI for the record panel form elements

---

## Common Rules for All Tools

1. **Project naming**: Use `breathing-guide`, `cognitive-training`, or `emotion-wheel` as the project name
2. **No backend API needed** for these tools — they are pure frontend. But still create `main.py` to serve static files (required for preview iframe)
3. **Single HTML file**: All logic inline in `index.html` (JS + CSS). No separate files needed.
4. **Chinese UI**: All text in Chinese. English only for code comments if needed.
5. **Mobile-first**: Must work well in a narrow iframe (~400px width)
6. **Soothing aesthetic**: These are mental health tools — use calm colors, smooth animations, generous whitespace
7. **No external API calls**: Everything runs client-side. No fetch() to external services.
8. **SVG pitfall**: `<template>` is an HTML element and does NOT work inside SVG namespace. Never use `<template x-for>` or similar templating inside `<svg>`. Generate SVG elements (paths, text, circles) with JavaScript `document.createElementNS('http://www.w3.org/2000/svg', ...)` or string concatenation via `innerHTML`.
8. **DaisyUI theme**: Use `data-theme="light"` for a clean, calming look
