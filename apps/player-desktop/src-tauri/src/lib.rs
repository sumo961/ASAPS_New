use tauri::{Emitter, Manager, LogicalSize};
use std::env;

/// Resize the window to match the story's stage dimensions
#[tauri::command]
fn resize_window(app: tauri::AppHandle, width: u32, height: u32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        // Add height for macOS title bar (32px) so content area matches stage
        let title_bar_height = 32u32;
        window.set_size(LogicalSize::new(width, height + title_bar_height))
            .map_err(|e| e.to_string())?;
        window.center()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Get the current working directory
#[tauri::command]
fn get_working_directory() -> Result<String, String> {
    env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// Get the directory where the app bundle is located (for finding story files)
/// On macOS, the executable is inside .app/Contents/MacOS/, so we go up 3 levels
#[tauri::command]
fn get_executable_directory() -> Result<String, String> {
    env::current_exe()
        .and_then(|exe_path| {
            let mut path = exe_path.clone();

            // Check if we're inside a macOS .app bundle
            // Path looks like: /path/to/App.app/Contents/MacOS/executable
            let path_str = path.to_string_lossy();
            if path_str.contains(".app/Contents/MacOS") {
                // Go up 3 levels: MacOS -> Contents -> App.app -> containing folder
                for _ in 0..3 {
                    path = path.parent()
                        .map(|p| p.to_path_buf())
                        .unwrap_or(path);
                }
                Ok(path)
            } else {
                // Not in a bundle, just return parent directory
                path.parent()
                    .map(|p| p.to_path_buf())
                    .ok_or_else(|| std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "No parent directory"
                    ))
            }
        })
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// Get command line arguments (for passing story directory)
#[tauri::command]
fn get_cli_args() -> Vec<String> {
    env::args().collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![resize_window, get_working_directory, get_executable_directory, get_cli_args])
        .setup(|app| {
            // Set up single instance on desktop platforms
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                app.handle().plugin(tauri_plugin_single_instance::init(move |_app, argv, _cwd| {
                    // Focus the main window when another instance tries to open
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.set_focus();
                    }

                    // Handle file argument if provided
                    if argv.len() > 1 {
                        let file_path = &argv[1];
                        if file_path.ends_with(".asaps") || file_path.ends_with(".zip") {
                            // Emit event to frontend to open the file
                            let _ = handle.emit("open-file", file_path);
                        }
                    }
                }))?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
