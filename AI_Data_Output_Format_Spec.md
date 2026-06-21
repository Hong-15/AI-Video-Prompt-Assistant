# AI Data Output Format Specification

> **Scope:** AI_Helper's user-level standard import/export format (not `userData.json`).
> **Purpose:** When you (the AI) are asked to generate prompts or supplementary prompts for AI_Helper, your output MUST strictly follow this format. The user saves it as `.md` or `.txt` and imports via "File → Import Project Data".

---

## Format Rules

```
## Task Name

**Card Name**：content

**Card Name 2**：content on the same line
Multi-line content follows directly after the colon.
```

> **CRITICAL:** Card names MUST be in Chinese (exactly as listed below). The `**` bold markers and the `：` colon are the parser's identifiers.

**Core Elements:**

| Element | Marker | Description |
|---------|--------|-------------|
| Task | `## ` level-2 heading | Followed by task name; numbering is optional (e.g. `## 1. Cyberpunk City`) |
| Card | `**CardName**：` | Card name in bold, followed by a colon (`：` or `:`), then content on the **same line** |
| Continuation | Non-marker lines | Lines not starting with `##` or `**` are appended to the current card (joined with newlines) |

---

## Standard Card Names (10 Fixed Dimensions)

Must use the following Chinese names exactly:

| # | Card Name | English Alias | Description |
|---|-----------|---------------|-------------|
| 1 | 主体特征 | Subject | Main subject appearance, pose, material |
| 2 | 场景环境 | Scene | Background, location, atmosphere |
| 3 | 光影色彩 | Lighting | Light direction, color tone, contrast |
| 4 | 艺术风格 | Style | Art style, genre, rendering style |
| 5 | 镜头景别 | Shot Scale | Composition, shot size, camera angle |
| 6 | 镜头运动 | Camera Movement | Camera motion (push, pull, pan, tilt, track, crane) |
| 7 | 时间节奏 | Time & Rhythm | Frame rate, slow motion, time-lapse |
| 8 | 动态事件 | Action | Actions, events, changes in frame |
| 9 | 技术参数 | Technical | Resolution, aspect ratio, focus |
| 10 | 负面排除 | Negative | Elements to exclude |

> Custom cards with any name (e.g. "Sound Design") are also supported. The software auto-matches them on import.

---

## Complete Examples

### Single Task

```markdown
## 1. Cyberpunk Rainy Night

**主体特征**：A cyborg detective in a black trench coat, left eye replaced with a red mechanical prosthetic, right arm exposing silver metal skeleton, short hair damp from rain.

**场景环境**：Neon-lit streets on a rainy night, holographic billboards flickering among towering skyscrapers, ground reflecting purple and blue light, hover cars passing in the distance.

**光影色彩**：Predominantly cool tones, red-purple neon light as the main light source, rain reflections creating a hazy atmosphere. High contrast, shadows tinted blue.

**艺术风格**：Cyberpunk style, high contrast, cinematic color grading, Blade Runner aesthetic.

**镜头景别**：Medium shot, half-body composition, low-angle shot emphasizing the character's isolation and the city's oppressive scale.

**镜头运动**：Slow orbit from behind the character to the front, subtle handheld shake for documentary realism.

**时间节奏**：Slow motion, 60 frames per second, raindrops falling at reduced speed.

**动态事件**：The character lights a cigarette, smoke rising slowly through the drizzle, neon light refracting through the smoke.

**技术参数**：4K, widescreen 21:9, shallow depth of field, sharp focus, cinematic color grading.

**负面排除**：No sunlight, no natural vegetation, no noise, no blur, no text, no watermark.
```

### Multiple Tasks

```markdown
## 1. Cyberpunk Rainy Night

**主体特征**：Cyborg detective, black trench coat, red prosthetic eye.

**场景环境**：Rainy neon street, holographic billboards.

**光影色彩**：Cool tones, neon red-purple light, high contrast.

## 2. Forest Elf

**主体特征**：Elf maiden, long green hair reaching the waist, pointed ears, wearing a dress woven from leaves and vines.

**场景环境**：Morning magical forest, sunlight piercing through the canopy in beams, ground covered in moss and glowing mushrooms.

**光影色彩**：Warm golden tones, god rays through leaves, soft light spots on grass and the elf.

**艺术风格**：Fantasy style, Ghibli aesthetic, soft color palette, hand-painted texture.

**镜头景别**：Medium-wide shot, elf in the forest setting, rule-of-thirds composition.

**动态事件**：The elf gently touches a glowing mushroom, it releases floating light particles.
```

---

## Strictly Forbidden

1. **Do NOT** use `# ` level-1 headings
2. **Do NOT** add metadata lines (e.g. "Export Time", "Task Count")
3. **Do NOT** use `### ` level-3 heading format (that is the card-level import format, incompatible)
4. **Do NOT** use `**内容**` on a separate line as a content marker (that is also the card-level format)
5. **Do NOT** put content on a separate line after the card name — content must be on the **same line** after the colon
6. **Do NOT** use `---` separator lines

---

## Import Method

AI-generated `.md` files can be imported via:

- **File menu → Import Project Data** — select a `.md` or `.txt` file
- Supports mixed MD (`**card**：`) and TXT (`card：`) format parsing
