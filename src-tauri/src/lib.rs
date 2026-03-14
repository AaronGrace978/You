use serde::{Deserialize, Serialize};
use reqwest::Client;

#[derive(Debug, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatRequest {
    provider: String,
    model: String,
    messages: Vec<ChatMessage>,
    api_key: Option<String>,
    ollama_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct ChatResponse {
    content: String,
}

#[tauri::command]
async fn chat(request: ChatRequest) -> Result<ChatResponse, String> {
    let client = Client::new();

    match request.provider.as_str() {
        "ollama" => chat_ollama(&client, &request).await,
        "openai" => chat_openai(&client, &request).await,
        "anthropic" => chat_anthropic(&client, &request).await,
        _ => Err(format!("Unknown provider: {}", request.provider)),
    }
}

async fn chat_ollama(client: &Client, req: &ChatRequest) -> Result<ChatResponse, String> {
    let url = format!(
        "{}/api/chat",
        req.ollama_url.as_deref().unwrap_or("http://localhost:11434")
    );

    let messages: Vec<serde_json::Value> = req
        .messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content,
            })
        })
        .collect();

    let body = serde_json::json!({
        "model": req.model,
        "messages": messages,
        "stream": false,
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama connection failed: {e}"))?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama error: {text}"));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let content = data["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(ChatResponse { content })
}

async fn chat_openai(client: &Client, req: &ChatRequest) -> Result<ChatResponse, String> {
    let api_key = req
        .api_key
        .as_deref()
        .ok_or("OpenAI API key is required")?;

    let messages: Vec<serde_json::Value> = req
        .messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content,
            })
        })
        .collect();

    let body = serde_json::json!({
        "model": req.model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 2048,
    });

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI connection failed: {e}"))?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI error: {text}"));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let content = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(ChatResponse { content })
}

async fn chat_anthropic(client: &Client, req: &ChatRequest) -> Result<ChatResponse, String> {
    let api_key = req
        .api_key
        .as_deref()
        .ok_or("Anthropic API key is required")?;

    let system_msg = req
        .messages
        .iter()
        .find(|m| m.role == "system")
        .map(|m| m.content.clone())
        .unwrap_or_default();

    let conversation: Vec<serde_json::Value> = req
        .messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            let role = if m.role == "user" {
                "user"
            } else {
                "assistant"
            };
            serde_json::json!({
                "role": role,
                "content": m.content,
            })
        })
        .collect();

    let body = serde_json::json!({
        "model": req.model,
        "max_tokens": 2048,
        "system": system_msg,
        "messages": conversation,
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic connection failed: {e}"))?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic error: {text}"));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let content = data["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(ChatResponse { content })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![chat])
        .run(tauri::generate_context!())
        .expect("error while running You");
}
