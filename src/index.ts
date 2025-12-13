import { Context, Plugin, PluginInitParams, PublicAPI, Query, Result } from "@wox-launcher/wox-plugin"
import { execFile } from "child_process"
import path from "path"

let api: PublicAPI
let pluginDirectory: string

export const plugin: Plugin = {
  init: async (ctx: Context, initParams: PluginInitParams) => {
    api = initParams.API
    pluginDirectory = initParams.PluginDirectory
    await api.Log(ctx, "Info", "Init finished")
  },

  query: async (ctx: Context, query: Query): Promise<Result[]> => {
    // Show color history when no command is specified
    if (!query.Command || query.Command === "") {
      const colorHistory = await api.GetSetting(ctx, "colorHistory") || "[]"
      const colors = JSON.parse(colorHistory)
      
      if (colors.length === 0) {
        return [
          {
            Title: "No color history",
            SubTitle: "Use 'color pick' to pick a color from screen",
            Icon: {
              ImageType: "relative",
              ImageData: "images/app.png"
            },
            Actions: [
              {
                Name: "Pick Color",
                Action: async () => {
                  await api.ChangeQuery(ctx, {
                    QueryType: "input",
                    QueryText: "color pick"
                  })
                }
              }
            ]
          }
        ]
      }
      
      return colors.map((color: string) => ({
        Title: color,
        SubTitle: "Click to copy",
        Icon: {
          ImageType: "svg",
          ImageData: `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="${color}" rx="32"/></svg>`
        },
        Actions: [
          {
            Name: "Copy",
            IsDefault: true,
            Action: async () => {
              // Copy to clipboard
            }
          },
          {
            Name: "Delete",
            Action: async () => {
              const colorHistory = await api.GetSetting(ctx, "colorHistory") || "[]"
              const colors = JSON.parse(colorHistory)
              const updatedColors = colors.filter((c: string) => c !== color)
              await api.SaveSetting(ctx, "colorHistory", JSON.stringify(updatedColors), false)
              await api.ChangeQuery(ctx, {
                QueryType: "input",
                QueryText: query.RawQuery
              })
            }
          }
        ]
      }))
    }
    
    if (query.Command == "pick") {
      return [
        {
          Title: "Pick an color from screen",
          SubTitle: "press enter to pick",
          Icon: {
            ImageType: "relative",
            ImageData: "images/app.png"
          },
          Actions: [
            {
              Name: "Pick Color",
              Action: async () => {
                // execute color_picker.exe or color_picker under bin folder depends on platform
                const binName = process.platform === "win32" ? "color_picker.exe" : "color_picker"
                const binPath = path.join(pluginDirectory, "bin", binName)
                
                await api.Log(ctx, "Info", `Starting color picker from: ${binPath}`)
                
                try {
                  const output = await new Promise<string>((resolve, reject) => {
                    execFile(binPath, [], (error, stdout, stderr) => {
                      if (error) {
                        reject(error)
                      } else {
                        resolve(stdout.trim())
                      }
                    })
                  })
                  
                  await api.Log(ctx, "Info", `Color from stdout: "${output}"`)
                  
                  if (output && output.match(/^#[0-9A-Fa-f]{6}$/)) {
                    await api.Log(ctx, "Info", `Valid color code: ${output}`)
                    
                    // Save the picked color to history
                    const colorHistory = await api.GetSetting(ctx, "colorHistory") || "[]"
                    const colors = JSON.parse(colorHistory)
                    
                    // Add new color at the beginning, avoid duplicates
                    const filteredColors = colors.filter((c: string) => c !== output)
                    filteredColors.unshift(output)
                    
                    // Keep only last 50 colors
                    const updatedColors = filteredColors.slice(0, 50)
                    
                    await api.SaveSetting(ctx, "colorHistory", JSON.stringify(updatedColors), false)
                    
                    await api.Notify(ctx, `Picked color: ${output}`)
                    await api.HideApp(ctx)
                  } else {
                    await api.Log(ctx, "Warning", `Invalid or empty color from stdout: ${output}`)
                  }
                } catch (error) {
                  await api.Log(ctx, "Error", `Failed to execute color picker: ${error}`)
                  await api.Notify(ctx,  `Failed to execute color picker: ${error}`)
                }
              }
            }
          ] 
        } as Result
      ]
    }

    return [
      {
        Title: "Hello World " + query.Search,
        SubTitle: "This is a subtitle",
        Icon: {
          ImageType: "relative",
          ImageData: "images/app.png"
        },
        Preview: {
          PreviewType: "text",
          PreviewData: "This is a preview",
          PreviewProperties: {
            Property1: "Hello World",
            Property2: "This is a property"
          }
        },
        Tails: [
          {
            Type: "text",
            Text: "This is a tail"
          }
        ],
        Actions: [
          {
            Name: "Open",
            Action: async () => {
              await api.ChangeQuery(ctx, {
                QueryType: "input",
                QueryText: "Hello World!"
              })
            }
          }
        ]
      }
    ]
  }
}
