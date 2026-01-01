use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
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
