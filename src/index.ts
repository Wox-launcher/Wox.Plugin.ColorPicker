import { Context, ExecuteResultAction, FormActionContext, FormResultAction, Plugin, PluginInitParams, PublicAPI, Query, Result, ResultAction, WoxImage } from "@wox-launcher/wox-plugin"
import type { PluginSettingDefinitionItem } from "@wox-launcher/wox-plugin/types/setting.js"
import { spawn } from "child_process"
import fs from "fs"
import path from "path"

let api: PublicAPI
let pluginDirectory: string

type ColorHex = `#${string}`
type KeywordMap = Record<string, string[]>

const SETTINGS_COLOR_HISTORY = "colorHistory"
const SETTINGS_FAVORITES = "favoriteColors"
const SETTINGS_KEYWORDS = "colorKeywords"

const GROUP_FAVORITES = "i18n:group_favorites"
const GROUP_HISTORY = "i18n:group_history"

const favIcon = {
  ImageType: "svg",
  ImageData: `<svg width="800" height="800" viewBox="0 0 32 32" xml:space="preserve" xmlns="http://www.w3.org/2000/svg"><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><path d="M30.9 10.6c-.1-.4-.5-.6-.9-.6h-9l-4.1-8.4Q16.6 1 16 1t-.9.6L11 10H2c-.4 0-.8.2-.9.6-.2.4-.1.8.2 1.1l6.6 7.6L5 29.7c-.1.4 0 .8.3 1s.7.3 1.1.1l9.6-4.6 9.6 4.6c.1.2.2.2.4.2.5 0 1-.4 1-1 0-.2 0-.3-.1-.5l-2.8-10.3 6.6-7.6c.3-.2.4-.7.2-1" fill="#fe9803"/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/></svg>`
} as WoxImage
const unfavIcon = {
  ImageType: "svg",
  ImageData: `<svg viewBox="0 -0.02 60.031 60.031" xmlns="http://www.w3.org/2000/svg"><g stroke-width="0"/><g stroke-linecap="round" stroke-linejoin="round"/><path d="m939.975 219.607 5.32 10.771a9.1 9.1 0 0 0 2.647 3.216 9.2 9.2 0 0 0 3.713 1.675l8.235 1.667-6.122 4.647a9.01 9.01 0 0 0-3.454 8.781l1.976 10.994-7.839-4.409a9.15 9.15 0 0 0-8.958 0l-7.833 4.405 1.974-10.984a9 9 0 0 0-3.43-8.776l-6.142-4.662 8.227-1.666a9.07 9.07 0 0 0 6.356-4.874l5.33-10.789m0-9.606a3.1 3.1 0 0 0-2.792 1.716l-7.914 16.018a3 3 0 0 1-.885 1.074 3.1 3.1 0 0 1-1.28.577l-14.654 2.967a3.07 3.07 0 0 0-2.391 2.285 3 3 0 0 0 1.117 3.085l11.4 8.657a3 3 0 0 1 .993 1.3 2.93 2.93 0 0 1 .16 1.618l-3.076 17.135a3 3 0 0 0 1.274 3.011 3.13 3.13 0 0 0 1.777.551 3.16 3.16 0 0 0 1.55-.4l13.174-7.409a3.16 3.16 0 0 1 3.09 0L954.7 269.6a3.16 3.16 0 0 0 3.326-.147 3 3 0 0 0 1.275-3.011l-3.083-17.142a2.95 2.95 0 0 1 .162-1.618 3 3 0 0 1 .993-1.3l11.4-8.657a3 3 0 0 0 1.117-3.085 3.07 3.07 0 0 0-2.393-2.285l-14.656-2.967a3.2 3.2 0 0 1-1.281-.577 3 3 0 0 1-.884-1.074l-7.91-16.018a3.11 3.11 0 0 0-2.791-1.719Z" data-name="no rating" transform="translate(-909.969 -210)" style="fill:#bf873e;fill-rule:evenodd"/></svg>`
} as WoxImage

function safeJsonParse<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function normalizeColorHex(input: string): ColorHex | null {
  const raw = input.trim()
  const match = raw.match(/^#?([0-9a-fA-F]{6})$/)
  if (!match) return null
  return `#${match[1].toUpperCase()}` as ColorHex
}

function uniqUpperColors(colors: string[]): ColorHex[] {
  const seen = new Set<string>()
  const out: ColorHex[] = []
  for (const c of colors) {
    const normalized = normalizeColorHex(c)
    if (!normalized) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

async function getColorHistory(ctx: Context): Promise<ColorHex[]> {
  const raw = (await api.GetSetting(ctx, SETTINGS_COLOR_HISTORY)) || "[]"
  const parsed = safeJsonParse<unknown>(raw, [])
  if (!Array.isArray(parsed)) return []
  return uniqUpperColors(parsed as string[])
}

async function saveColorHistory(ctx: Context, colors: ColorHex[]): Promise<void> {
  await api.SaveSetting(ctx, SETTINGS_COLOR_HISTORY, JSON.stringify(colors), false)
}

async function getFavoriteColors(ctx: Context): Promise<ColorHex[]> {
  const raw = (await api.GetSetting(ctx, SETTINGS_FAVORITES)) || "[]"
  const parsed = safeJsonParse<unknown>(raw, [])
  if (!Array.isArray(parsed)) return []
  return uniqUpperColors(parsed as string[])
}

async function saveFavoriteColors(ctx: Context, colors: ColorHex[]): Promise<void> {
  await api.SaveSetting(ctx, SETTINGS_FAVORITES, JSON.stringify(colors), false)
}

async function getColorKeywords(ctx: Context): Promise<KeywordMap> {
  const raw = (await api.GetSetting(ctx, SETTINGS_KEYWORDS)) || "{}"
  const parsed = safeJsonParse<unknown>(raw, {})
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

  const out: KeywordMap = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const normalized = normalizeColorHex(key)
    if (!normalized) continue
    if (!Array.isArray(value)) continue
    const keywords = (value as unknown[]).map(v => (typeof v === "string" ? v.trim() : "")).filter(v => v.length > 0)
    if (keywords.length > 0) out[normalized] = Array.from(new Set(keywords))
  }
  return out
}

async function saveColorKeywords(ctx: Context, keywords: KeywordMap): Promise<void> {
  await api.SaveSetting(ctx, SETTINGS_KEYWORDS, JSON.stringify(keywords), false)
}

function colorIcon(color: ColorHex): WoxImage {
  return {
    ImageType: "svg",
    ImageData: `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="${color}" rx="32"/></svg>`
  }
}

async function ensureExecutable(binPath: string): Promise<void> {
  if (process.platform !== "darwin") return
  if (!fs.existsSync(binPath)) return
  try {
    await fs.promises.chmod(binPath, 0o755)
  } catch {
    // If chmod fails, spawn will likely fail with EACCES anyway; keep the original error surface.
  }
}

async function copyToClipboard(text: string): Promise<void> {
  const platform = process.platform

  if (platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const p = spawn("clip")
      p.on("error", reject)
      p.on("close", code => (code === 0 ? resolve() : reject(new Error(`clip exited with ${code}`))))
      p.stdin.write(text)
      p.stdin.end()
    })
    return
  }

  if (platform === "darwin") {
    await new Promise<void>((resolve, reject) => {
      const p = spawn("pbcopy")
      p.on("error", reject)
      p.on("close", code => (code === 0 ? resolve() : reject(new Error(`pbcopy exited with ${code}`))))
      p.stdin.write(text)
      p.stdin.end()
    })
    return
  }

  await new Promise<void>((resolve, reject) => {
    const p = spawn("sh", ["-lc", "command -v wl-copy >/dev/null 2>&1 && wl-copy || xclip -selection clipboard"], {
      stdio: ["pipe", "ignore", "pipe"]
    })
    let stderr = ""
    p.stderr.on("data", d => (stderr += String(d)))
    p.on("error", reject)
    p.on("close", code => (code === 0 ? resolve() : reject(new Error(stderr || `clipboard exited with ${code}`))))
    p.stdin.write(text)
    p.stdin.end()
  })
}

function matchesTerms(color: ColorHex, keywords: string[], terms: string[]): boolean {
  if (terms.length === 0) return true
  const colorLower = color.toLowerCase()
  const keywordLower = keywords.map(k => k.toLowerCase())
  return terms.every(t => colorLower.includes(t) || keywordLower.some(k => k.includes(t)))
}

function parseKeywordInput(raw: string): string[] {
  const parts = raw
    .split(",")
    .map(p => p.trim())
    .filter(p => p.length > 0)
  return Array.from(new Set(parts))
}

type TextBoxValue = {
  Key: string
  Label: string
  DefaultValue: string
  Tooltip: string
  MaxLines: number
  GetKey: () => string
  GetDefaultValue: () => string
  Translate: (translator: (ctx: Context, key: string) => string) => void
}

function textBox(params: { key: string; label: string; defaultValue: string; tooltip?: string; maxLines?: number }): PluginSettingDefinitionItem {
  const value: TextBoxValue = {
    Key: params.key,
    Label: params.label,
    DefaultValue: params.defaultValue,
    Tooltip: params.tooltip ?? "",
    MaxLines: params.maxLines ?? 1,
    GetKey: () => params.key,
    GetDefaultValue: () => params.defaultValue,
    Translate: () => {}
  }

  return {
    Type: "textbox",
    Value: value,
    DisabledInPlatforms: [],
    IsPlatformSpecific: false
  }
}

export const plugin: Plugin = {
  init: async (ctx: Context, initParams: PluginInitParams) => {
    api = initParams.API
    pluginDirectory = initParams.PluginDirectory
    await api.Log(ctx, "Info", "Init finished")
  },

  query: async (ctx: Context, query: Query): Promise<Result[]> => {
    if (query.Command && query.Command !== "") {
      if (query.Command !== "pick") {
        return [
          {
            Title: `i18n:unknown_command_prefix${query.Command}`,
            SubTitle: "i18n:unknown_command_hint",
            Icon: { ImageType: "relative", ImageData: "images/app.png" }
          }
        ]
      }
    }

    if (query.Command === "pick") {
      return [
        {
          Title: "i18n:result_pick_title",
          SubTitle: "i18n:result_pick_subtitle",
          Icon: { ImageType: "relative", ImageData: "images/app.png" },
          Actions: [
            {
              Type: "execute",
              Name: "i18n:action_pick_color",
              IsDefault: true,
              Action: async () => {
                const binName = process.platform === "win32" ? "color_picker_windows.exe" : "color_picker_macos"
                const binPath = path.join(pluginDirectory, "bin", binName)

                await api.Log(ctx, "Info", `Starting color picker from: ${binPath}`)

                await ensureExecutable(binPath)

                const output = await new Promise<string>((resolve, reject) => {
                  const p = spawn(binPath, [])
                  let stdout = ""
                  let stderr = ""
                  p.stdout.on("data", d => (stdout += String(d)))
                  p.stderr.on("data", d => (stderr += String(d)))
                  p.on("error", reject)
                  p.on("close", code => {
                    if (code === 0) resolve(stdout.trim())
                    else reject(new Error(stderr || `color picker exited with ${code}`))
                  })
                })

                const normalized = normalizeColorHex(output)
                if (!normalized) {
                  await api.Log(ctx, "Warning", `Invalid or empty color from stdout: ${output}`)
                  return
                }

                const colors = await getColorHistory(ctx)
                const filteredColors = colors.filter(c => c !== normalized)
                filteredColors.unshift(normalized)
                const updatedColors = filteredColors.slice(0, 50)
                await saveColorHistory(ctx, updatedColors)

                await api.Notify(ctx, `i18n:notify_picked_prefix${normalized}`)
                await api.HideApp(ctx)
              }
            } satisfies ExecuteResultAction
          ]
        } satisfies Result
      ]
    }

    const [history, favorites, keywordMap] = await Promise.all([getColorHistory(ctx), getFavoriteColors(ctx), getColorKeywords(ctx)])

    const terms = query.Search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const favoriteSet = new Set(favorites)

    const buildColorResult = (color: ColorHex, group: string, canDeleteFromHistory: boolean): Result => {
      const keywords = keywordMap[color] || []
      const keywordText = keywords.join(", ")
      const isFavorite = favoriteSet.has(color)

      const copyAction: ResultAction = {
        Type: "execute",
        Name: "i18n:action_copy",
        IsDefault: true,
        Action: async () => {
          try {
            await copyToClipboard(color)
            await api.Notify(ctx, `i18n:notify_copied_prefix${color}`)
          } catch (e) {
            await api.Notify(ctx, `i18n:notify_copy_failed_prefix${String(e)}`)
          }
        }
      }

      const favoriteAction: ResultAction = {
        Type: "execute",
        Name: isFavorite ? "i18n:action_unfavorite" : "i18n:action_favorite",
        Icon: isFavorite ? favIcon : unfavIcon,
        PreventHideAfterAction: true,
        Action: async () => {
          const currentFavorites = await getFavoriteColors(ctx)
          const nowSet = new Set(currentFavorites)
          const updated = nowSet.has(color) ? currentFavorites.filter(c => c !== color) : [color, ...currentFavorites.filter(c => c !== color)]
          await saveFavoriteColors(ctx, updated)
          await api.RefreshQuery(ctx, { PreserveSelectedIndex: true })
        }
      }

      const editKeywordsAction: ResultAction = {
        Type: "form",
        Name: "i18n:action_edit_keywords",
        Icon: { ImageType: "emoji", ImageData: "🏷️" },
        PreventHideAfterAction: true,
        Form: [
          textBox({
            key: "keyword",
            label: "i18n:keyword_label",
            defaultValue: keywordText,
            tooltip: "i18n:keyword_tooltip",
            maxLines: 2
          })
        ],
        OnSubmit: async (actionContext: FormActionContext) => {
          const raw = String(actionContext.Values.keyword ?? "").trim()
          const keywords = parseKeywordInput(raw)
          const current = await getColorKeywords(ctx)
          if (keywords.length === 0) delete current[color]
          else current[color] = keywords
          await saveColorKeywords(ctx, current)
          await api.RefreshQuery(ctx, { PreserveSelectedIndex: true })
        }
      } satisfies FormResultAction

      const actions: ResultAction[] = [copyAction, favoriteAction, editKeywordsAction]

      if (canDeleteFromHistory) {
        actions.push({
          Type: "execute",
          Name: "i18n:action_remove_history",
          Icon: { ImageType: "emoji", ImageData: "🗑️" },
          PreventHideAfterAction: true,
          Action: async () => {
            const currentHistory = await getColorHistory(ctx)
            await saveColorHistory(
              ctx,
              currentHistory.filter(c => c !== color)
            )
            await api.RefreshQuery(ctx, { PreserveSelectedIndex: true })
          }
        })
      }

      return {
        Id: `color:${color}`,
        Title: color,
        SubTitle: keywords.length > 0 ? `i18n:subtitle_keywords_prefix${keywordText}` : "i18n:subtitle_click_copy",
        Icon: colorIcon(color),
        Group: group,
        GroupScore: group === GROUP_FAVORITES ? 100 : 10,
        Actions: actions
      }
    }

    const favoriteResults = favorites.filter(c => matchesTerms(c, keywordMap[c] || [], terms)).map(c => buildColorResult(c, GROUP_FAVORITES, history.includes(c)))

    const historyResults = history
      .filter(c => !favoriteSet.has(c))
      .filter(c => matchesTerms(c, keywordMap[c] || [], terms))
      .map(c => buildColorResult(c, GROUP_HISTORY, true))

    const allResults = [...favoriteResults, ...historyResults]

    if (allResults.length === 0) {
      const hasAny = favorites.length > 0 || history.length > 0
      return [
        {
          Title: hasAny ? "i18n:empty_no_match" : "i18n:empty_no_colors",
          SubTitle: "i18n:empty_pick_hint",
          Icon: { ImageType: "relative", ImageData: "images/app.png" },
          Actions: [
            {
              Type: "execute",
              Name: "i18n:action_pick_color",
              IsDefault: true,
              Action: async () => {
                await api.ChangeQuery(ctx, { QueryType: "input", QueryText: "color pick" })
              }
            }
          ]
        }
      ]
    }

    return allResults
  }
}
