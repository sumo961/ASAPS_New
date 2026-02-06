//! Local LLM module for embedded AI functionality
//!
//! Uses llama.cpp via Rust bindings for local model inference.
//! Supports Gemma 3:4B and other GGUF models.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

/// Model information returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub downloaded: bool,
}

/// Available models for download
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableModel {
    pub id: String,
    pub name: String,
    pub description: String,
    pub size_gb: f32,
    pub url: String,
    pub recommended: bool,
}

/// Download progress event
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub percent: f32,
}

/// LLM state managed by Tauri
pub struct LlmState {
    pub model_path: Mutex<Option<PathBuf>>,
    pub model_loaded: Mutex<bool>,
}

impl Default for LlmState {
    fn default() -> Self {
        Self {
            model_path: Mutex::new(None),
            model_loaded: Mutex::new(false),
        }
    }
}

/// Get the models directory path
fn get_models_dir() -> Result<PathBuf, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or("Could not find app data directory")?;

    let models_dir = data_dir.join("ASAPS Player").join("models");

    // Create directory if it doesn't exist
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("Failed to create models directory: {}", e))?;

    Ok(models_dir)
}

/// List available models that can be downloaded
#[tauri::command]
pub fn llm_list_available_models() -> Vec<AvailableModel> {
    vec![
        AvailableModel {
            id: "gemma-3-4b".to_string(),
            name: "Gemma 3 4B".to_string(),
            description: "Google's Gemma 3 4B parameter model. Good balance of quality and speed.".to_string(),
            size_gb: 2.5,
            url: "https://huggingface.co/google/gemma-3-4b-it-qat-q4_0-gguf/resolve/main/gemma-3-4b-it-q4_0.gguf".to_string(),
            recommended: true,
        },
        AvailableModel {
            id: "gemma-2-2b".to_string(),
            name: "Gemma 2 2B".to_string(),
            description: "Smaller and faster model. Limited capabilities but runs on more devices.".to_string(),
            size_gb: 1.3,
            url: "https://huggingface.co/google/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf".to_string(),
            recommended: false,
        },
        AvailableModel {
            id: "phi-2".to_string(),
            name: "Phi-2 2.7B".to_string(),
            description: "Microsoft's Phi-2 model. Fast and efficient for simple tasks.".to_string(),
            size_gb: 1.5,
            url: "https://huggingface.co/TheBloke/phi-2-GGUF/resolve/main/phi-2.Q4_K_M.gguf".to_string(),
            recommended: false,
        },
    ]
}

/// Check if a model is downloaded
#[tauri::command]
pub fn llm_check_model(model_id: String) -> Result<ModelInfo, String> {
    let models_dir = get_models_dir()?;
    let model_path = models_dir.join(format!("{}.gguf", model_id));

    let downloaded = model_path.exists();
    let size_bytes = if downloaded {
        std::fs::metadata(&model_path)
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    Ok(ModelInfo {
        name: model_id.clone(),
        path: model_path.to_string_lossy().to_string(),
        size_bytes,
        downloaded,
    })
}

/// Get the path to a downloaded model
#[tauri::command]
pub fn llm_get_model_path(model_id: String) -> Result<String, String> {
    let models_dir = get_models_dir()?;
    let model_path = models_dir.join(format!("{}.gguf", model_id));

    if model_path.exists() {
        Ok(model_path.to_string_lossy().to_string())
    } else {
        Err(format!("Model {} not found", model_id))
    }
}

/// Download a model (returns immediately, progress sent via events)
#[cfg(feature = "embedded-ai")]
#[tauri::command]
pub async fn llm_download_model(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<(), String> {
    use futures_util::StreamExt;
    use tauri::Emitter;

    // Find the model info
    let models = llm_list_available_models();
    let model = models.iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| format!("Unknown model: {}", model_id))?;

    let models_dir = get_models_dir()?;
    let model_path = models_dir.join(format!("{}.gguf", model_id));

    // If already downloaded, skip
    if model_path.exists() {
        return Ok(());
    }

    // Create temp file for download
    let temp_path = models_dir.join(format!("{}.gguf.tmp", model_id));

    // Download the model
    let client = reqwest::Client::new();
    let response = client.get(&model.url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;

        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;

        downloaded += chunk.len() as u64;

        // Emit progress event
        let progress = DownloadProgress {
            model_id: model_id.clone(),
            bytes_downloaded: downloaded,
            total_bytes: total_size,
            percent: if total_size > 0 {
                (downloaded as f32 / total_size as f32) * 100.0
            } else {
                0.0
            },
        };

        let _ = app.emit("llm-download-progress", progress);
    }

    // Rename temp file to final path
    std::fs::rename(&temp_path, &model_path)
        .map_err(|e| format!("Failed to finalize download: {}", e))?;

    Ok(())
}

#[cfg(not(feature = "embedded-ai"))]
#[tauri::command]
pub async fn llm_download_model(
    _app: tauri::AppHandle,
    _model_id: String,
) -> Result<(), String> {
    Err("Embedded AI feature not enabled. Rebuild with --features embedded-ai".to_string())
}

/// Delete a downloaded model
#[tauri::command]
pub fn llm_delete_model(model_id: String) -> Result<(), String> {
    let models_dir = get_models_dir()?;
    let model_path = models_dir.join(format!("{}.gguf", model_id));

    if model_path.exists() {
        std::fs::remove_file(&model_path)
            .map_err(|e| format!("Failed to delete model: {}", e))?;
    }

    Ok(())
}

/// Generate text using local model
#[cfg(feature = "embedded-ai")]
#[tauri::command]
pub async fn llm_generate(
    state: State<'_, LlmState>,
    model_id: String,
    prompt: String,
    max_tokens: u32,
) -> Result<String, String> {
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::model::LlamaModel;
    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::model::params::LlamaModelParams;

    let models_dir = get_models_dir()?;
    let model_path = models_dir.join(format!("{}.gguf", model_id));

    if !model_path.exists() {
        return Err(format!("Model {} not downloaded", model_id));
    }

    // Initialize llama backend
    let backend = LlamaBackend::init()
        .map_err(|e| format!("Failed to initialize LLM backend: {}", e))?;

    // Load model
    let model_params = LlamaModelParams::default();
    let model = LlamaModel::load_from_file(&backend, &model_path, &model_params)
        .map_err(|e| format!("Failed to load model: {}", e))?;

    // Create context
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(std::num::NonZeroU32::new(2048));
    let mut ctx = model.new_context(&backend, ctx_params)
        .map_err(|e| format!("Failed to create context: {}", e))?;

    // Tokenize prompt
    let tokens = model.str_to_token(&prompt, true)
        .map_err(|e| format!("Failed to tokenize: {}", e))?;

    // Run inference
    ctx.decode(&tokens, true)
        .map_err(|e| format!("Failed to decode: {}", e))?;

    // Sample tokens
    let mut output = String::new();
    for _ in 0..max_tokens {
        let token = ctx.sample_token(None)
            .map_err(|e| format!("Failed to sample: {}", e))?;

        if model.is_eog_token(token) {
            break;
        }

        let piece = model.token_to_str(token, true)
            .map_err(|e| format!("Failed to decode token: {}", e))?;

        output.push_str(&piece);

        ctx.decode(&[token], false)
            .map_err(|e| format!("Failed to decode: {}", e))?;
    }

    Ok(output)
}

#[cfg(not(feature = "embedded-ai"))]
#[tauri::command]
pub async fn llm_generate(
    _state: State<'_, LlmState>,
    _model_id: String,
    _prompt: String,
    _max_tokens: u32,
) -> Result<String, String> {
    Err("Embedded AI feature not enabled. Rebuild with --features embedded-ai".to_string())
}

/// Check if embedded AI is available
#[tauri::command]
pub fn llm_is_available() -> bool {
    cfg!(feature = "embedded-ai")
}
