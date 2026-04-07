---
name: file-organizer
label: 文件整理
description: Intelligently organize and categorize files in the workspace
---

## 触发条件

当用户请求整理、组织或分类文件时自动触发，例如：
- "帮我整理一下工作区的文件"
- "把这些文件按类型分类"
- "整理 uploads 文件夹"
- "按日期组织这些文件"

## 核心原则

1. **安全第一**：执行任何移动操作前，必须先向用户展示完整方案并获得确认
2. **保持简洁**：顶层文件夹限制在 3-7 个，避免过度细分
3. **易于访问**：常用文件应放在容易找到的位置
4. **保留结构**：如果已有合理的组织结构，只做增量调整

## 支持的整理策略

### 1. 按文件类型分类（type）

将文件按扩展名分组到语义化的文件夹：

```
📁 images/         - .png, .jpg, .jpeg, .gif, .bmp, .svg, .webp
📁 documents/      - .pdf, .doc, .docx, .txt, .md, .rtf
📁 spreadsheets/   - .csv, .xlsx, .xls
📁 presentations/  - .ppt, .pptx
📁 code/           - .py, .js, .ts, .java, .cpp, .html, .css
📁 archives/       - .zip, .tar, .gz, .rar, .7z
📁 others/         - 其他未分类文件
```

**适用场景**：文件类型混杂、缺少组织结构的工作区

### 2. 按日期分类（date）

根据文件修改时间组织：

```
📁 2026/
   ├── 01-January/
   ├── 02-February/
   └── 03-March/
📁 2025/
   └── ...
```

**适用场景**：时间序列数据、日志文件、按时间归档的项目

### 3. 按项目/主题分类（project）

通过分析文件名、内容和关联性，智能推断项目分组：

```
📁 data-analysis/     - 包含 data*.csv, analysis*.py, report*.pdf
📁 web-development/   - 包含 *.html, *.css, *.js
📁 documentation/     - 包含 *.md, *.txt, README*
📁 assets/            - 包含 logo*, banner*, icon*
```

**适用场景**：多项目混合工作区、需要语义化组织的场景

**实现方式**：
- 分析文件名中的关键词（如 "report", "analysis", "test"）
- 检测文件间的关联性（如同名不同扩展名）
- 识别常见项目模式（如前端项目结构、数据分析流程）

## 工作流程

### Step 1: 分析当前状态

```python
# 使用 list_dir 获取文件列表
files = list_dir('uploads')  # 或 'outputs'

# 统计文件信息
file_stats = {
    'total_files': len(files),
    'file_types': Counter([Path(f).suffix for f in files]),
    'total_size': sum([os.path.getsize(f) for f in files]),
    'date_range': (min_date, max_date)
}
```

### Step 2: 提出整理方案

根据分析结果和用户偏好，生成整理计划：

```markdown
## 📋 整理方案

**当前状态**：
- 共 42 个文件，总大小 156 MB
- 文件类型：.csv (15), .png (12), .py (8), .pdf (7)
- 时间范围：2025-11-03 至 2026-04-07

**建议策略**：按文件类型分类

**操作预览**：
1. 创建文件夹：images/, spreadsheets/, code/, documents/
2. 移动 12 个图片文件到 images/
3. 移动 15 个 CSV 文件到 spreadsheets/
4. 移动 8 个 Python 脚本到 code/
5. 移动 7 个 PDF 文件到 documents/

**预计耗时**：< 1 秒

是否执行？
```

### Step 3: 等待用户确认

**必须显式等待用户回复"确认"、"执行"、"yes"等肯定答复**

❌ **禁止**自动执行，即使用户之前说过"整理文件"
✅ **必须**在展示方案后暂停，等待新的用户消息

### Step 4: 执行整理

确认后使用 `run_command` 工具执行文件移动：

```python
import os
import shutil
from pathlib import Path

def organize_by_type(source_dir: str):
    """按文件类型整理文件"""
    
    # 定义分类规则
    categories = {
        'images': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'],
        'documents': ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'],
        'spreadsheets': ['.csv', '.xlsx', '.xls'],
        'presentations': ['.ppt', '.pptx'],
        'code': ['.py', '.js', '.ts', '.java', '.cpp', '.html', '.css'],
        'archives': ['.zip', '.tar', '.gz', '.rar', '.7z']
    }
    
    source = Path(source_dir)
    
    # 创建目标文件夹
    for category in categories.keys():
        (source / category).mkdir(exist_ok=True)
    
    # 移动文件
    moved_count = 0
    for file_path in source.iterdir():
        if file_path.is_file():
            ext = file_path.suffix.lower()
            
            # 查找匹配的分类
            target_category = None
            for category, extensions in categories.items():
                if ext in extensions:
                    target_category = category
                    break
            
            # 如果没有匹配分类，移到 others/
            if target_category is None:
                target_category = 'others'
                (source / target_category).mkdir(exist_ok=True)
            
            # 移动文件
            target_path = source / target_category / file_path.name
            shutil.move(str(file_path), str(target_path))
            moved_count += 1
    
    return moved_count

# 执行整理
result = organize_by_type('uploads')
print(f"✅ 已整理 {result} 个文件")
```

### Step 5: 报告结果

```markdown
## ✅ 整理完成

**执行结果**：
- 已移动 42 个文件
- 创建了 4 个文件夹：images/, spreadsheets/, code/, documents/

**新的文件结构**：
```
uploads/
├── images/ (12 files)
├── spreadsheets/ (15 files)
├── code/ (8 files)
└── documents/ (7 files)
```

可以使用 `list_dir('uploads')` 查看详细内容。
```

## 实现细节

### 文件名模式识别

```python
# 常见项目关键词
PROJECT_KEYWORDS = {
    'analysis': ['分析', 'analysis', 'analyze', 'stats'],
    'report': ['报告', 'report', 'summary'],
    'test': ['测试', 'test', 'demo', 'sample'],
    'backup': ['备份', 'backup', 'archive'],
    'temp': ['临时', 'temp', 'tmp', 'draft']
}

def detect_project(filename: str) -> str:
    """从文件名推断项目类型"""
    name_lower = filename.lower()
    
    for project_type, keywords in PROJECT_KEYWORDS.items():
        if any(kw in name_lower for kw in keywords):
            return project_type
    
    return 'others'
```

### 冲突处理

如果目标位置已存在同名文件：

```python
def get_unique_path(target_path: Path) -> Path:
    """生成唯一文件名，避免覆盖"""
    if not target_path.exists():
        return target_path
    
    stem = target_path.stem
    suffix = target_path.suffix
    parent = target_path.parent
    
    counter = 1
    while True:
        new_path = parent / f"{stem}_{counter}{suffix}"
        if not new_path.exists():
            return new_path
        counter += 1
```

## 安全限制

1. **只处理工作区文件**：操作范围限制在 `workspace/{session_id}/uploads` 和 `workspace/{session_id}/outputs`
2. **禁止删除文件**：只移动，不删除任何文件
3. **保留文件名**：不重命名文件（除非冲突）
4. **幂等操作**：可以安全地重复执行

## 使用示例

### 示例 1：基础整理

```
用户：帮我整理一下 uploads 文件夹
AI：
1. 分析文件 [使用 list_dir]
2. 提出方案 [展示预览]
3. 等待确认
用户：确认
AI：执行整理 [使用 run_command 执行 Python 脚本]
```

### 示例 2：指定策略

```
用户：把这些文件按日期整理
AI：
[分析] 检测到文件时间范围 2025-10 至 2026-04
[方案] 建议创建 2025/, 2026/ 文件夹，按月细分
[等待] 是否执行？
用户：好的
AI：[执行] 已整理完成
```

### 示例 3：增量整理

```
用户：只整理图片文件
AI：
[分析] 检测到 12 个图片文件（.png, .jpg）
[方案] 移动到 images/ 文件夹
[等待] 确认执行？
用户：执行
AI：[完成] 已移动 12 个图片文件
```

## 预装依赖

无需额外安装，使用 Python 标准库即可：
- `os` - 文件系统操作
- `shutil` - 文件移动
- `pathlib` - 路径处理
- `datetime` - 日期处理
- `collections.Counter` - 统计

## 常见问题

**Q: 如果用户只说"整理文件"，应该用哪种策略？**
A: 默认使用"按文件类型分类"（type），因为它最通用且结果最可预测。

**Q: 如果文件已经有部分组织结构怎么办？**
A: 只处理顶层散乱文件，不递归处理已有文件夹内的内容。

**Q: 是否支持撤销操作？**
A: 当前不支持。建议在执行前明确展示预览，让用户充分了解操作结果。未来可考虑实现操作日志+回滚功能。
