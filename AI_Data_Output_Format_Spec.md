# AI Data Output Format Specification

> **Scope:** AI_Helper's user-level standard import/export format (not `userData.json`).
> **Purpose:** When you (the AI) are asked to generate prompts or supplementary prompts for AI_Helper, your output MUST strictly follow this format. The user can save it as `.md` and drag-and-drop directly into the workspace.

---

## Format Rules

```
## Task Name

### Card Name
**内容**
First line of content
Second line (multi-line supported)

### Card Name 2
**内容**
Content of card 2...
```

**Core Elements:**

| Element | Marker | Description |
|---------|--------|-------------|
| Task | `## ` level-2 heading | Followed by task name; numbering is optional (e.g. `## 1. Cyberpunk City` or `## Cyberpunk City`) |
| Card | `### ` level-3 heading | Followed by card name, must exactly match the "Standard Card Names" listed below |
| Content Marker | `**内容**` | The line immediately after `###`, on its own line (MUST be `**内容**`, not `**Content**` or any other variation) |
| Card Content | Lines after marker | Starts from the line after `**内容**`, ends at the next `##` or `###` |

> **CRITICAL:** The content marker is ALWAYS `**内容**` (Chinese characters), never translated. This is how the parser identifies content blocks.

---

## Standard Card Names (10 Fixed Dimensions)

Must use the following names exactly (matching the software's fieldConfig), case-sensitive:

| # | Card Name | English Alias | Description |
|---|-----------|---------------|-------------|
| 1 | 主体特征 | Subject | Describe the main subject (person, object, creature, etc.): appearance, posture, material |
| 2 | 场景环境 | Scene | Describe the background, location, environment atmosphere |
| 3 | 光影色彩 | Lighting | Describe light direction, color tone, ambient light, contrast |
| 4 | 艺术风格 | Style | Describe art style, genre, rendering style, film grain |
| 5 | 镜头景别 | Shot Scale | Describe composition, shot size (close-up/medium/wide), camera angle |
| 6 | 镜头运动 | Camera Movement | Describe camera motion (push, pull, pan, tilt, track, crane) |
| 7 | 时间节奏 | Time & Rhythm | Describe frame rate, slow motion, time-lapse, temporal properties |
| 8 | 动态事件 | Action | Describe actions, events, changes within the frame |
| 9 | 技术参数 | Technical | Describe resolution, aspect ratio, focus, technical parameters |
| 10 | 负面排除 | Negative | Describe elements that should NOT appear |

> If you need descriptions beyond these 10 fixed dimensions, you may use **custom cards** with any name (e.g. "Sound Design", "Transition Style"). The software will auto-create them upon import.

---

## Complete Examples

### Single Task

```markdown
## Cyberpunk Rainy Night

### 主体特征
**内容**
A cyborg detective in a black trench coat, left eye replaced with a red mechanical prosthetic, right arm exposing silver metal skeleton, short hair damp from rain.

### 场景环境
**内容**
Neon-lit streets on a rainy night, holographic billboards flickering among towering skyscrapers, ground reflecting purple and blue light, hover cars passing in the distance.

### 光影色彩
**内容**
Predominantly cool tones, red-purple neon light as the main light source, rain reflections creating a hazy atmosphere. High contrast, shadows tinted blue.

### 艺术风格
**内容**
Cyberpunk style, high contrast, cinematic color grading, Blade Runner aesthetic.

### 镜头景别
**内容**
Medium shot, half-body composition, low-angle shot emphasizing the character's isolation and the city's oppressive scale.

### 镜头运动
**内容**
Slow orbit from behind the character to the front, subtle handheld shake for documentary realism.

### 时间节奏
**内容**
Slow motion, 60 frames per second, raindrops falling at reduced speed.

### 动态事件
**内容**
The character lights a cigarette, smoke rising slowly through the drizzle, neon light refracting through the smoke.

### 技术参数
**内容**
4K, widescreen 21:9, shallow depth of field, sharp focus, cinematic color grading.

### 负面排除
**内容**
No sunlight, no natural vegetation, no noise, no blur, no text, no watermark.
```

### Multiple Tasks

```markdown
## Cyberpunk Rainy Night

### 主体特征
**内容**
Cyborg detective, black trench coat, red prosthetic eye.

### 场景环境
**内容**
Rainy neon street, holographic billboards.

### 光影色彩
**内容**
Cool tones, neon red-purple light, high contrast.

## Forest Elf

### 主体特征
**内容**
Elf maiden, long green hair reaching the waist, pointed ears, wearing a dress woven from leaves and vines.

### 场景环境
**内容**
Morning magical forest, sunlight piercing through the canopy in beams, ground covered in moss and glowing mushrooms.

### 光影色彩
**内容**
Warm golden tones, god rays through leaves, soft light spots on grass and the elf.

### 艺术风格
**内容**
Fantasy style, Ghibli aesthetic, soft color palette, hand-painted texture.

### 镜头景别
**内容**
Medium-wide shot, elf in the forest setting, rule-of-thirds composition.

### 动态事件
**内容**
The elf gently touches a glowing mushroom, it releases floating light particles.
```

---

## Strictly Forbidden

1. **Do NOT** add `# ` level-1 headings (e.g. `# AI_Helper Export Data`)
2. **Do NOT** add metadata lines (e.g. "Export Time", "Task Count", "Author", etc.)
3. **Do NOT** use `---` or `======` separator lines
4. **Do NOT** put content on the same line as `**内容**` — content MUST start on the next line
5. **Do NOT** use the inline format `**Card Name**: content` (that is the project export format, incompatible with card import)
6. **Do NOT** use the `【Task Name】` bracket format (that is the TXT export format)
7. **Do NOT** insert blank lines between `**内容**` and the actual content — content starts on the immediate next line
8. **Do NOT** insert explanatory text between tasks or cards

---

## Import Methods

AI-generated `.md` files can be imported into AI_Helper via:

- **Drag & drop** the `.md` file onto the workspace area → creates a new task or appends to the current task
- **Drag & drop** the `.md` file onto a specific task in the sidebar → appends to that task
- **Workspace** → click the "📥 Import Data" button → select the `.md` file
